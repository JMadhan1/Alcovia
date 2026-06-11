import fs from 'fs';
import path from 'path';

export interface Operation {
  op_id: string; student_id: string; device_id: string; op_type: string;
  payload: string; lamport_clock: number; created_at: number; server_seq: number;
}
export interface Session {
  session_id: string; student_id: string; device_id: string; target_minutes: number;
  started_at: number; completed_at: number | null; status: string; fail_reason: string | null;
  reward_granted: number; notified: number;
}
export interface Task {
  task_id: string; student_id: string; chapter_id: string; subject_id: string;
  title: string; status: string; lamport_clock: number; device_id: string;
  deleted: number; deleted_lamport: number | null;
}
export interface StudentState {
  student_id: string; coins: number; streak_days: number;
  focus_minutes_today: number; last_focus_date: string;
}
export interface N8nSent { session_id: string; sent_at: number; }

// One row per notification *attempt* — both fires (SENT) and deduped retries
// (BLOCKED). This is what the Dev Panel renders as the visual exactly-once proof.
export interface NotifyLogEntry {
  session_id: string;
  student_id: string;
  streak_days: number;
  coins_earned: number;
  fired_at: number;
  source_device: string;
  duplicate_blocked: boolean;
}

interface DBData {
  operations: Operation[]; sessions: Session[]; tasks: Task[];
  student_state: StudentState[]; n8n_sent: N8nSent[]; server_seq: number;
  notify_log: NotifyLogEntry[];
}

const DATA_FILE = path.join(__dirname, '../../alcovia-db.json');

function loadData(): DBData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      // Backfill fields added after a file was first written.
      if (!parsed.notify_log) parsed.notify_log = [];
      return parsed;
    }
  } catch {}
  return {
    operations: [], sessions: [], tasks: [],
    student_state: [{ student_id: 'student-001', coins: 0, streak_days: 0, focus_minutes_today: 0, last_focus_date: '' }],
    n8n_sent: [], server_seq: 0, notify_log: [],
  };
}

export class AppDB {
  private data: DBData;
  private dirty = false;

  constructor() {
    this.data = loadData();
    setInterval(() => { if (this.dirty) { this.flush(); } }, 2000);
  }
  private touch() { this.dirty = true; }
  flush() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2)); this.dirty = false; } catch(e) { console.error('[db]', e); } }

  // server_seq
  getSeq(): number { return this.data.server_seq; }
  nextSeq(): number { this.data.server_seq++; this.touch(); return this.data.server_seq; }

  // operations
  getOperation(opId: string) { return this.data.operations.find(o => o.op_id === opId); }
  insertOperation(op: Operation) { if (!this.getOperation(op.op_id)) { this.data.operations.push(op); this.touch(); } }
  getOperationsSince(studentId: string, sinceSeq: number) {
    return this.data.operations.filter(o => o.student_id === studentId && o.server_seq > sinceSeq).sort((a,b) => a.server_seq - b.server_seq);
  }

  // sessions
  getSession(sessionId: string) { return this.data.sessions.find(s => s.session_id === sessionId); }
  insertSession(s: Session) { if (!this.getSession(s.session_id)) { this.data.sessions.push(s); this.touch(); } }
  updateSessionRewardGranted(sessionId: string) { const s = this.getSession(sessionId); if (s) { s.reward_granted = 1; this.touch(); } }
  updateSessionNotified(sessionId: string) { const s = this.getSession(sessionId); if (s) { s.notified = 1; this.touch(); } }
  getSessionsByStudent(studentId: string) { return this.data.sessions.filter(s => s.student_id === studentId); }

  // tasks
  getTask(taskId: string, studentId: string) { return this.data.tasks.find(t => t.task_id === taskId && t.student_id === studentId); }
  upsertTask(t: Task) {
    const idx = this.data.tasks.findIndex(x => x.task_id === t.task_id && x.student_id === t.student_id);
    if (idx >= 0) this.data.tasks[idx] = t; else this.data.tasks.push(t);
    this.touch();
  }
  getTasksByStudent(studentId: string) { return this.data.tasks.filter(t => t.student_id === studentId); }

  // student_state
  getStudentState(studentId: string) { return this.data.student_state.find(s => s.student_id === studentId); }
  upsertStudentState(s: StudentState) {
    const idx = this.data.student_state.findIndex(x => x.student_id === s.student_id);
    if (idx >= 0) this.data.student_state[idx] = s; else this.data.student_state.push(s);
    this.touch();
  }

  // n8n dedup store — the durable, single source of truth for exactly-once.
  isN8nSent(sessionId: string) { return this.data.n8n_sent.some(x => x.session_id === sessionId); }
  markN8nSent(sessionId: string) { if (!this.isN8nSent(sessionId)) { this.data.n8n_sent.push({ session_id: sessionId, sent_at: Date.now() }); this.touch(); } }

  // notification log (SENT + BLOCKED attempts), newest last, capped at 50
  addNotifyLog(entry: NotifyLogEntry) {
    this.data.notify_log.push(entry);
    if (this.data.notify_log.length > 50) this.data.notify_log = this.data.notify_log.slice(-50);
    this.touch();
  }
  getNotifyLog() { return [...this.data.notify_log]; }

  // Full reset for clean demos.
  reset() {
    this.data.operations = [];
    this.data.sessions = [];
    this.data.tasks = [];
    this.data.n8n_sent = [];
    this.data.notify_log = [];
    this.data.server_seq = 0;
    this.data.student_state = [{ student_id: 'student-001', coins: 0, streak_days: 0, focus_minutes_today: 0, last_focus_date: '' }];
    this.flush();
  }
}

export function initDatabase(): AppDB {
  const db = new AppDB();
  console.log('[db] ready (json file: alcovia-db.json)');
  return db;
}
