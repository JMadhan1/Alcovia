export class LamportClock {
  private value: number;
  private storageKey: string;

  constructor(deviceId: string) {
    // Namespaced to match ClientDB's key convention (`<deviceId>:lamport_clock`)
    // so the Dev Panel — which reads via ClientDB.getLamportClock() — shows the
    // same value the clock actually persists.
    this.storageKey = `${deviceId}:lamport_clock`;
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
    // `!== null`, not a truthy check: a device that has done exactly 0 ops stores
    // the string "0", which is falsy — a truthy check would silently re-init.
    this.value = stored !== null ? parseInt(stored, 10) : 0;
  }

  tick(): number {
    this.value += 1;
    this.persist();
    return this.value;
  }

  receive(remoteValue: number): number {
    this.value = Math.max(this.value, remoteValue) + 1;
    this.persist();
    return this.value;
  }

  current(): number {
    return this.value;
  }

  private persist(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, String(this.value));
    }
  }
}

export function resolveConflict(
  opA: { lamport_clock: number; device_id: string },
  opB: { lamport_clock: number; device_id: string }
): 'A' | 'B' {
  if (opA.lamport_clock !== opB.lamport_clock) {
    return opA.lamport_clock > opB.lamport_clock ? 'A' : 'B';
  }
  return opA.device_id > opB.device_id ? 'A' : 'B';
}
