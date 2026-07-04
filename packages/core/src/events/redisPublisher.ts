import Redis from "ioredis";
import { requireRedisUrl } from "../config/redis";

/**
 * Publisher lazy/fail-closed:
 * - preserva precedência RUN_EVENTS_REDIS_URL ?? REDIS_URL;
 * - não instancia Redis em top-level;
 * - falha fechado ao publicar se a URL não estiver configurada.
 */
type RedisPublisherClient = Pick<Redis, "publish" | "quit" | "disconnect">;
type RedisPublisherFactory = (url: string) => RedisPublisherClient;

let redisPublisher: RedisPublisherClient | null = null;
let redisPublisherFactory: RedisPublisherFactory = (url) => new Redis(url);

function resolveRedisPublisherUrl(): string {
  return requireRedisUrl(
    process.env.RUN_EVENTS_REDIS_URL ?? process.env.REDIS_URL,
    "redisPublisher"
  );
}

export function getRedisPublisher(): RedisPublisherClient {
  if (!redisPublisher) {
    redisPublisher = redisPublisherFactory(resolveRedisPublisherUrl());
  }
  return redisPublisher;
}

export function setRedisPublisherFactoryForTests(factory: RedisPublisherFactory | null): void {
  redisPublisherFactory = factory ?? ((url) => new Redis(url));
  redisPublisher = null;
}

export function hasRedisPublisherInstanceForTests(): boolean {
  return redisPublisher !== null;
}

/**
 * Publica eventos de forma tipada e segura.
 */
export async function publishEvent(channel: string, payload: unknown) {
  if (!channel) {
    throw new Error("publishEvent: channel vazio ou inválido.");
  }

  try {
    const message = JSON.stringify(payload);
    await getRedisPublisher().publish(channel, message);
  } catch (err) {
    console.error("[RedisPublisher] Falha ao publicar evento:", err);
    throw err;
  }
}

export async function closeRedisPublisher() {
  if (!redisPublisher) {
    return;
  }

  const current = redisPublisher;
  redisPublisher = null;

  try {
    await current.quit();
  } catch {
    current.disconnect();
    return;
  }
  current.disconnect();
}
