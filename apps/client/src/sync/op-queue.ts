import { v4 as uuidv4 } from 'uuid';
import { ClientDB } from '../db/client-db';
import { LamportClock } from './lamport';
import { Operation, OpType } from '../types';

export class OperationQueue {
  constructor(
    private db: ClientDB,
    private clock: LamportClock,
    private deviceId: string
  ) {}

  enqueue(opType: OpType, payload: Record<string, unknown>): Operation {
    const op: Operation = {
      op_id: uuidv4(),
      student_id: 'student-001',
      device_id: this.deviceId,
      op_type: opType,
      payload,
      lamport_clock: this.clock.tick(),
      created_at: Date.now(),
      synced: false,
    };
    this.db.addPendingOp(op);
    return op;
  }

  getPending(): Operation[] {
    return this.db.getPendingOps().filter((op) => !op.synced);
  }

  markSynced(opId: string): void {
    this.db.markOpSynced(opId);
  }

  clearSynced(): void {
    this.db.clearSyncedOps();
  }
}
