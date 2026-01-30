import Redis from "ioredis";

/**
 * Cria cliente Redis seguro, evitando os overloads inválidos do construtor.
 * - Se REDIS_URL ou RUN_EVENTS_REDIS_URL existir → usa como string direta.
 * - Caso contrário → usa localhost:6379 com opções explícitas.
 */
const redisUrl = process.env.RUN_EVENTS_REDIS_URL ?? process.env.REDIS_URL;

export const redisPublisher = redisUrl
  ? new Redis(redisUrl) // Caminho 1: formato redis://...
  : new Redis({
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

/**
 * Publica eventos de forma tipada e segura.
 */
export async function publishEvent(channel: string, payload: unknown) {
  if (!channel) {
    throw new Error("publishEvent: channel vazio ou inválido.");
  }

  try {
    const message = JSON.stringify(payload);
    await redisPublisher.publish(channel, message);
  } catch (err) {
    console.error("[RedisPublisher] Falha ao publicar evento:", err);
    throw err;
  }
}
