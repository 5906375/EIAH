import { connection } from "@eiah/core/queue/connection";

/**
 * Conexão compartilhada com Redis via BullMQ.
 * Este wrapper mantém compatibilidade entre os workers locais e o core.
 */
export { connection };
