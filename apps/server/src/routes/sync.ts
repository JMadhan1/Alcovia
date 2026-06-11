import { Router, Request, Response } from 'express';
import { AppDB } from '../db/database';
import { SyncPushPayload, SyncPullResponse, Operation } from '../types';
import { grantReward } from '../services/reward';
import { fireN8nWebhook } from '../services/n8n';

export function createSyncRouter(
  db: AppDB,
  broadcastSync: (studentId: string, fromDevice: string) => void
): Router {
  const router = Router();

  router.post('/push', async (req: Request, res: Response) => {
    try {
      const payload: SyncPushPayload = req.body;
      if (!payload.student_id || !payload.device_id || !Array.isArray(payload.operations)) {
        return res.status(400).json({ error: 'Invalid payload' });
      }

      const acceptedOpIds: string[] = [];

      for (const op of payload.operations) {
        try {
          if (!db.getOperation(op.op_id)) {
            const newSeq = db.nextSeq();
            db.insertOperation({
              op_id: op.op_id, student_id: op.student_id, device_id: op.device_id,
              op_type: op.op_type, payload: JSON.stringify(op.payload),
              lamport_clock: op.lamport_clock, created_at: op.created_at, server_seq: newSeq,
            });
          }
          acceptedOpIds.push(op.op_id);

          if (op.op_type === 'SESSION_SUCCESS') {
            const sessionId = (op.payload as any).session_id;
            if (!db.getSession(sessionId)) {
              db.insertSession({
                session_id: sessionId, student_id: payload.student_id, device_id: payload.device_id,
                target_minutes: (op.payload as any).target_minutes, started_at: (op.payload as any).started_at,
                completed_at: Date.now(), status: 'success', fail_reason: null, reward_granted: 0, notified: 0,
              });
            }
            grantReward(db, sessionId, payload.student_id);
            await fireN8nWebhook(db, sessionId, payload.student_id, payload.device_id);

          } else if (op.op_type === 'SESSION_FAIL') {
            const sessionId = (op.payload as any).session_id;
            if (!db.getSession(sessionId)) {
              db.insertSession({
                session_id: sessionId, student_id: payload.student_id, device_id: payload.device_id,
                target_minutes: (op.payload as any).target_minutes, started_at: (op.payload as any).started_at,
                completed_at: Date.now(), status: 'failed', fail_reason: (op.payload as any).fail_reason || null,
                reward_granted: 0, notified: 0,
              });
            }

          } else if (op.op_type === 'TASK_UPDATE') {
            const { task_id, status, chapter_id, subject_id, title } = op.payload as any;
            const existing = db.getTask(task_id, payload.student_id);
            if (!existing || op.lamport_clock >= existing.lamport_clock) {
              db.upsertTask({
                task_id, student_id: payload.student_id, chapter_id, subject_id, title,
                status, lamport_clock: op.lamport_clock, device_id: op.device_id, deleted: 0, deleted_lamport: null,
              });
            }

          } else if (op.op_type === 'TASK_DELETE') {
            const { task_id, chapter_id, subject_id, title } = op.payload as any;
            const existing = db.getTask(task_id, payload.student_id);
            if (!existing || op.lamport_clock >= existing.lamport_clock) {
              db.upsertTask({
                task_id, student_id: payload.student_id,
                chapter_id: chapter_id || '', subject_id: subject_id || '', title: title || '',
                status: 'not_started', lamport_clock: op.lamport_clock, device_id: op.device_id,
                deleted: 1, deleted_lamport: op.lamport_clock,
              });
            }
          }
        } catch (err) {
          console.error(`Error processing op ${op.op_id}:`, err);
        }
      }

      // Broadcast to all other connected clients so they pull immediately
      // instead of waiting for the next poll interval.
      if (acceptedOpIds.length > 0) {
        broadcastSync(payload.student_id, payload.device_id);
      }

      res.json({ accepted_op_ids: acceptedOpIds, server_seq: db.getSeq() });
    } catch (err) {
      console.error('Push route error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/pull', (req: Request, res: Response) => {
    try {
      const { student_id, since_seq, device_id } = req.query;
      if (!student_id) return res.status(400).json({ error: 'Missing student_id' });

      const sinceSeq = since_seq ? parseInt(since_seq as string, 10) : 0;
      const allOps = db.getOperationsSince(student_id as string, sinceSeq);
      const remoteOps = allOps
        .filter(op => op.device_id !== device_id)
        .map(op => ({ ...op, payload: JSON.parse(op.payload) }));

      const studentState = db.getStudentState(student_id as string) || {
        student_id: student_id as string, coins: 0, streak_days: 0, focus_minutes_today: 0, last_focus_date: '',
      };

      const pullResponse: SyncPullResponse = {
        operations: remoteOps as any[],
        server_seq: db.getSeq(),
        student_state: studentState,
        sessions: db.getSessionsByStudent(student_id as string) as any[],
        tasks: db.getTasksByStudent(student_id as string) as any[],
      };

      res.json(pullResponse);
    } catch (err) {
      console.error('Pull route error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
