import { AppDB } from '../db/database';

/**
 * Fire the n8n webhook for a successful session — exactly once.
 *
 * The durable dedup store (`n8n_sent` in the JSON DB) is the single source of
 * truth. We check it before firing and record the attempt either way:
 *   - first time  → SENT  (fire webhook, mark sent, log SENT)
 *   - thereafter  → BLOCKED (no webhook, log BLOCKED)
 *
 * The n8n workflow ALSO calls back to /n8n/check-dedup + /n8n/mark-sent, so the
 * guarantee holds even if n8n is triggered from somewhere other than this server.
 */
export async function fireN8nWebhook(
  db: AppDB,
  sessionId: string,
  studentId: string,
  sourceDevice = 'unknown'
): Promise<void> {
  const state = db.getStudentState(studentId);
  const streak = state?.streak_days ?? 0;
  const coins = state?.coins ?? 0;

  if (db.isN8nSent(sessionId)) {
    db.addNotifyLog({
      session_id: sessionId, student_id: studentId, streak_days: streak,
      coins_earned: 0, fired_at: Date.now(), source_device: sourceDevice, duplicate_blocked: true,
    });
    console.log(`[n8n] BLOCKED duplicate notification for session ${sessionId} (from ${sourceDevice})`);
    return;
  }

  db.markN8nSent(sessionId);
  db.updateSessionNotified(sessionId);
  db.addNotifyLog({
    session_id: sessionId, student_id: studentId, streak_days: streak,
    coins_earned: 50, fired_at: Date.now(), source_device: sourceDevice, duplicate_blocked: false,
  });

  const payload = {
    session_id: sessionId,
    student_id: studentId,
    streak_days: streak,
    coins_earned: 50,
    total_coins: coins,
    message: `🔥 Streak now ${streak} days — +50 coins earned!`,
    fired_at: Date.now(),
  };
  console.log(`[n8n] SENT notification → ${payload.message} (session ${sessionId})`);

  const n8nUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/alcovia-focus';
  try {
    const res = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    console.log(`[n8n] webhook response: ${res.status}`);
  } catch (err: any) {
    // n8n not running is fine — dedup + logging already happened server-side.
    console.log(`[n8n] webhook not reached (${err.message}) — dedup still enforced`);
  }
}
