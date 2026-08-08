import { createDefaultState, cloneData } from "../scripts/data/state.js";

export class MemoryRepository {
  constructor(state = createDefaultState()) {
    this.state = cloneData(state);
  }

  async load() {
    return cloneData(this.state);
  }

  async save(state) {
    this.state = cloneData(state);
    return cloneData(this.state);
  }
}

export function deterministicOptions() {
  let id = 0;
  let now = 1_700_000_000_000;
  return {
    now: () => now++,
    idFactory: () => `id-${++id}`,
    userId: () => "gm-1",
    gameTime: () => 12345
  };
}
