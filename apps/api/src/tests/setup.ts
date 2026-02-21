import { EventEmitter } from "node:events";

// Desativa limite no runner de testes para evitar warnings de pools.
EventEmitter.defaultMaxListeners = 0;
