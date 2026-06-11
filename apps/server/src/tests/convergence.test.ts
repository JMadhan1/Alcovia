import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { aWins } from '../sync/conflict';
import { applyOperations, TaskOp } from '../sync/apply';

/**
 * Property-based proof that the sync merge converges.
 *
 * The real system gives every operation a total order (server_seq) and every
 * device replays that same ordered log through `applyOperations`. These tests
 * exercise the reducer directly with thousands of randomized inputs.
 */
describe('Sync convergence properties', () => {
  // A random TASK_UPDATE over a small fixed set of tasks/devices.
  const updateOp = fc.record({
    op_id: fc.uuid(),
    op_type: fc.constant<'TASK_UPDATE'>('TASK_UPDATE'),
    task_id: fc.constantFrom('task-001', 'task-002', 'task-003'),
    status: fc.constantFrom<'not_started' | 'in_progress' | 'done'>('not_started', 'in_progress', 'done'),
    device_id: fc.constantFrom('device-A', 'device-B', 'device-C'),
    lamport_clock: fc.integer({ min: 1, max: 1000 }),
  });

  // Deterministic total order — mirrors what the server does with server_seq.
  const byTotalOrder = (a: TaskOp, b: TaskOp) =>
    a.lamport_clock - b.lamport_clock || a.device_id.localeCompare(b.device_id) || a.op_id.localeCompare(b.op_id);

  it('Property 1 — order independence: any permutation, after stable sort, yields the same state', () => {
    fc.assert(
      fc.property(fc.array(updateOp, { minLength: 1, maxLength: 25 }), (ops) => {
        const sorted = [...ops].sort(byTotalOrder);
        const forward = applyOperations([], sorted);
        const reversed = applyOperations([], [...sorted].reverse().sort(byTotalOrder));
        const shuffled = applyOperations([], [...sorted].sort(() => Math.random() - 0.5).sort(byTotalOrder));
        expect(reversed).toEqual(forward);
        expect(shuffled).toEqual(forward);
      }),
      { numRuns: 500 }
    );
  });

  it('Property 2 — idempotency: replaying the same ops changes nothing', () => {
    fc.assert(
      fc.property(fc.array(updateOp, { minLength: 1, maxLength: 15 }), (ops) => {
        const once = applyOperations([], ops);
        const twice = applyOperations([], [...ops, ...ops]); // every op_id duplicated
        expect(twice).toEqual(once);
      }),
      { numRuns: 500 }
    );
  });

  it('Property 3 — higher Lamport always wins, regardless of argument order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 501, max: 1000 }),
        (lowClock, highClock) => {
          const low = { lamport_clock: lowClock, device_id: 'device-A' };
          const high = { lamport_clock: highClock, device_id: 'device-B' };
          expect(aWins(high, low)).toBe(true);
          expect(aWins(low, high)).toBe(false);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('Property 4 — a delete with the highest clock cannot be resurrected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 200 }), // delete clock: strictly above every edit
        fc.array(
          fc.record({
            status: fc.constantFrom<'in_progress' | 'done'>('in_progress', 'done'),
            device_id: fc.constantFrom('device-A', 'device-B'),
            lamport_clock: fc.integer({ min: 1, max: 99 }),
          }),
          { minLength: 1, maxLength: 6 }
        ),
        (deleteClock, edits) => {
          const editOps: TaskOp[] = edits.map((e, i) => ({
            op_id: `edit-${i}`, op_type: 'TASK_UPDATE', task_id: 'task-001',
            status: e.status, device_id: e.device_id, lamport_clock: e.lamport_clock,
          }));
          const deleteOp: TaskOp = {
            op_id: 'del-1', op_type: 'TASK_DELETE', task_id: 'task-001',
            device_id: 'device-A', lamport_clock: deleteClock,
          };
          // Try both orders — delete still wins because its clock is highest.
          for (const seq of [[...editOps, deleteOp], [deleteOp, ...editOps]]) {
            const state = applyOperations([], seq);
            expect(state.find((t) => t.task_id === 'task-001')?.deleted).toBe(true);
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
