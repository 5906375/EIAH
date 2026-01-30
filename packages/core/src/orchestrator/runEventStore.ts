import type { RunEvent } from "@eiah/contracts";

export type OrchestratorRunEvent = Omit<RunEvent, "id" | "createdAt">;

export interface RunEventStore {
  record(event: OrchestratorRunEvent): Promise<void>;
}

export class CompositeRunEventStore implements RunEventStore {
  private readonly stores: RunEventStore[];

  constructor(stores: RunEventStore[]) {
    this.stores = stores;
  }

  async record(event: OrchestratorRunEvent) {
    await Promise.all(this.stores.map((store) => store.record(event)));
  }
}
