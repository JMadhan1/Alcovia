/**
 * Conflict ordering — the deterministic rule that decides which write wins.
 *
 * Total order: higher Lamport clock wins; ties broken by higher device_id
 * (lexicographic). This is pure, total, and independent of wall-clock time and
 * of the order operations arrive in — which is what makes convergence provable.
 */
export interface Versioned {
  lamport_clock: number;
  device_id: string;
}

/** True iff `a` should win over `b`. */
export function aWins(a: Versioned, b: Versioned): boolean {
  if (a.lamport_clock !== b.lamport_clock) return a.lamport_clock > b.lamport_clock;
  return a.device_id > b.device_id;
}
