import { ClientDB } from '../db/client-db';
import { OperationQueue } from './op-queue';
import { LamportClock, resolveConflict } from './lamport';
import { isOnline } from './network';
import { Operation, SyncPushPayload, SyncPullResponse, TaskStatus } from '../types';

export class SyncEngine {
  private isSyncing = false;

  constructor(
    private db: ClientDB,
    private queue: OperationQueue,
    private clock: LamportClock,
    public readonly deviceId: string,
    private serverUrl: string
  ) {}

  async sync(): Promise<void> {
    // Authoritative offline gate: while this device is toggled offline, no sync
    // path (auto-sync, manual, or dev-panel) touches the network. Ops accumulate
    // in the local queue and flush on reconnect.
    if (this.isSyncing || !isOnline(this.deviceId)) return;
    this.isSyncing = true;
    try {
      await this.push();
      await this.pull();
      this.queue.clearSynced();
    } finally {
      this.isSyncing = false;
    }
  }

  private async push(): Promise<void> {
    const pending = this.queue.getPending();
    if (!pending.length) return;

    const res = await fetch(`${this.serverUrl}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: 'student-001',
        device_id: this.deviceId,
        operations: pending,
        last_server_seq: this.db.getLastServerSeq(),
      } as SyncPushPayload),
    });
    if (!res.ok) throw new Error(`Push ${res.status}`);
    const { accepted_op_ids } = await res.json();
    for (const id of accepted_op_ids) this.queue.markSynced(id);
  }

  private async pull(): Promise<void> {
    const res = await fetch(
      `${this.serverUrl}/sync/pull?student_id=student-001&since_seq=${this.db.getLastServerSeq()}&device_id=${this.deviceId}`
    );
    if (!res.ok) throw new Error(`Pull ${res.status}`);
    const data: SyncPullResponse = await res.json();

    // Apply remote ops (only from other devices)
    for (const op of data.operations) {
      if (op.device_id !== this.deviceId) this.applyOp(op);
    }

    // Merge sessions from server (reward/notified flags may be updated)
    for (const ss of data.sessions) {
      const local = this.db.getSession(ss.session_id);
      if (!local) {
        this.db.saveSession(ss);
      } else {
        // Server is source of truth for reward_granted / notified
        this.db.saveSession({
          ...local,
          reward_granted: local.reward_granted || ss.reward_granted,
          notified: local.notified || ss.notified,
        });
      }
    }

    // Merge tasks from server — server wins on lamport ties (it saw both)
    for (const st of data.tasks) {
      const local = this.db.getTask(st.task_id);
      if (!local || st.lamport_clock >= local.lamport_clock) {
        // Update flat task store
        this.db.saveTask({
          task_id: st.task_id, chapter_id: st.chapter_id, subject_id: st.subject_id,
          student_id: 'student-001', title: st.title,
          status: st.status as TaskStatus,
          lamport_clock: st.lamport_clock, device_id: st.device_id,
          deleted: !!st.deleted,
          ...(st.deleted_lamport ? { deleted_lamport: st.deleted_lamport } : {}),
        });
        // Also update the subjects tree so UI reflects the merged state
        this.applyTaskToSubjects(st.task_id, st.status as TaskStatus, !!st.deleted, st.lamport_clock, st.device_id);
      }
    }

    // Student state comes from server (authoritative for coins/streak)
    this.db.setStudentState(data.student_state);
    this.db.setLastServerSeq(data.server_seq);

    const maxClock = Math.max(0, ...data.operations.map(o => o.lamport_clock));
    if (maxClock > 0) this.clock.receive(maxClock);
  }

  private applyOp(op: Operation): void {
    switch (op.op_type) {
      case 'TASK_UPDATE': {
        const { task_id, status, chapter_id, subject_id, title } = op.payload as any;
        const existing = this.db.getTask(task_id);
        // Conflict resolution: higher Lamport wins; alphabetic device_id as tiebreak
        if (!existing || resolveConflict(op, existing) === 'A') {
          this.db.saveTask({
            task_id, chapter_id: chapter_id||existing?.chapter_id||'',
            subject_id: subject_id||existing?.subject_id||'',
            student_id: 'student-001', title: title||existing?.title||'',
            status: status as TaskStatus, lamport_clock: op.lamport_clock,
            device_id: op.device_id, deleted: false,
          });
          this.applyTaskToSubjects(task_id, status as TaskStatus, false, op.lamport_clock, op.device_id);
        }
        break;
      }
      case 'TASK_DELETE': {
        const { task_id } = op.payload as any;
        const existing = this.db.getTask(task_id);
        // Delete wins if lamport(delete) >= lamport(last edit) — tombstone strategy
        if (!existing || op.lamport_clock >= existing.lamport_clock) {
          this.db.deleteTask(task_id, op.lamport_clock, op.device_id);
          this.applyTaskToSubjects(task_id, 'not_started', true, op.lamport_clock, op.device_id);
        }
        break;
      }
      case 'SESSION_SUCCESS':
      case 'SESSION_FAIL': {
        const sid = (op.payload as any).session_id;
        if (!this.db.getSession(sid)) this.db.saveSession(op.payload as any);
        break;
      }
    }
  }

  /** Keep the nested subjects tree in sync with flat task updates */
  private applyTaskToSubjects(taskId: string, status: TaskStatus, deleted: boolean, lamport: number, deviceId: string): void {
    const subjects = this.db.getSubjects();
    let changed = false;
    const updated = subjects.map(s => ({
      ...s,
      chapters: s.chapters.map(ch => ({
        ...ch,
        tasks: ch.tasks.map(t => {
          if (t.task_id !== taskId) return t;
          // Only apply if incoming lamport >= current
          if (lamport < t.lamport_clock) return t;
          changed = true;
          return { ...t, status, deleted, lamport_clock: lamport, device_id: deviceId,
            ...(deleted ? { deleted_lamport: lamport } : {}) };
        }),
      })),
    }));
    if (changed) this.db.saveSubjects(updated);
  }
}
