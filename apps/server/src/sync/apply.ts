import { aWins } from './conflict';

/**
 * Pure task-state reducer — the same merge logic the sync route applies, lifted
 * out so it can be property-tested in isolation.
 *
 * Rules:
 *  - op_id dedup: an operation applied twice has no extra effect (idempotency).
 *  - TASK_UPDATE: applied iff it wins the conflict ordering (Lamport, device_id).
 *  - TASK_DELETE: a tombstone; wins iff its Lamport >= the current version's
 *    (delete is "sticky" so a slightly-stale edit can't resurrect a deleted task).
 */
export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface TaskOp {
  op_id: string;
  op_type: 'TASK_UPDATE' | 'TASK_DELETE';
  task_id: string;
  status?: TaskStatus;
  lamport_clock: number;
  device_id: string;
}

export interface TaskState {
  task_id: string;
  status: TaskStatus;
  lamport_clock: number;
  device_id: string;
  deleted: boolean;
}

export function applyOperations(initial: TaskState[], ops: TaskOp[]): TaskState[] {
  const map = new Map<string, TaskState>();
  for (const t of initial) map.set(t.task_id, { ...t });

  const seen = new Set<string>();
  for (const op of ops) {
    if (seen.has(op.op_id)) continue; // idempotency: same op_id is a no-op the 2nd time
    seen.add(op.op_id);

    const cur = map.get(op.task_id);

    if (op.op_type === 'TASK_UPDATE') {
      const incoming: TaskState = {
        task_id: op.task_id,
        status: op.status ?? 'not_started',
        lamport_clock: op.lamport_clock,
        device_id: op.device_id,
        deleted: false,
      };
      if (!cur || aWins(op, cur)) map.set(op.task_id, incoming);
    } else {
      // TASK_DELETE
      if (!cur) {
        map.set(op.task_id, {
          task_id: op.task_id, status: 'not_started',
          lamport_clock: op.lamport_clock, device_id: op.device_id, deleted: true,
        });
      } else if (op.lamport_clock >= cur.lamport_clock) {
        map.set(op.task_id, { ...cur, deleted: true, lamport_clock: op.lamport_clock, device_id: op.device_id });
      }
    }
  }

  // Sort by task_id so two states are comparable with deep equality.
  return [...map.values()].sort((a, b) => a.task_id.localeCompare(b.task_id));
}
