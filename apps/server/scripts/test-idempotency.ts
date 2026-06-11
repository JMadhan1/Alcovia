/**
 * End-to-end idempotency smoke test.
 *
 * Run the server first (`npm run dev`), then: `npm run test:idempotency`.
 *
 * Simulates the exact danger case: the SAME focus session synced from BOTH
 * devices. Asserts the reward is granted once (+50, not +100) and the n8n
 * notification fires once (one SENT, the rest BLOCKED).
 */
const BASE = process.env.SERVER_URL || 'http://localhost:3001';
const STUDENT = 'student-001';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function push(deviceId: string, sessionId: string) {
  const op = {
    op_id: uuid(),
    student_id: STUDENT,
    device_id: deviceId,
    op_type: 'SESSION_SUCCESS',
    payload: { session_id: sessionId, target_minutes: 25, started_at: Date.now() },
    lamport_clock: 1,
    created_at: Date.now(),
    synced: false,
  };
  const res = await fetch(`${BASE}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: STUDENT, device_id: deviceId, operations: [op], last_server_seq: 0 }),
  });
  if (!res.ok) throw new Error(`push from ${deviceId} failed: ${res.status}`);
}

async function main() {
  console.log(`→ Testing against ${BASE}`);
  await fetch(`${BASE}/dev/reset`, { method: 'POST' });

  const sessionId = uuid();
  console.log(`→ session_id = ${sessionId}`);

  // Same session completed + synced from BOTH devices.
  await push('device-A', sessionId);
  await push('device-B', sessionId);

  // Read authoritative state + notification log.
  const pull: any = await (await fetch(`${BASE}/sync/pull?student_id=${STUDENT}&since_seq=0&device_id=observer`)).json() as any;
  const log: any[] = await (await fetch(`${BASE}/webhook/notify-log`)).json() as any[];

  const coins = pull.student_state.coins;
  const forSession = log.filter((e) => e.session_id === sessionId);
  const sent = forSession.filter((e) => !e.duplicate_blocked).length;
  const blocked = forSession.filter((e) => e.duplicate_blocked).length;

  const checks: [string, boolean, string][] = [
    ['coins granted exactly once (+50)', coins === 50, `coins=${coins}`],
    ['exactly one notification SENT', sent === 1, `sent=${sent}`],
    ['duplicate notification BLOCKED', blocked >= 1, `blocked=${blocked}`],
    ['one session row, reward_granted=1', pull.sessions.filter((s: any) => s.session_id === sessionId).length === 1 && pull.sessions.find((s: any) => s.session_id === sessionId)?.reward_granted === 1, 'session row'],
  ];

  let ok = true;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? '  ✅ PASS' : '  ❌ FAIL'}  ${name}  (${detail})`);
    if (!pass) ok = false;
  }
  console.log(ok ? '\nIDEMPOTENCY: PASS ✅' : '\nIDEMPOTENCY: FAIL ❌');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('test errored:', e); process.exit(1); });
