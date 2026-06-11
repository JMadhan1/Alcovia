-- Operations log — the single source of truth for sync
CREATE TABLE IF NOT EXISTS operations (
  op_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  op_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  lamport_clock INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  server_seq INTEGER,
  UNIQUE(op_id)
);

-- Sessions — deduplicated by session_id
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL,
  fail_reason TEXT,
  reward_granted INTEGER DEFAULT 0,
  notified INTEGER DEFAULT 0,
  UNIQUE(session_id)
);

-- Tasks — server keeps latest version per task (for pull responses)
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  lamport_clock INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  deleted INTEGER DEFAULT 0,
  deleted_lamport INTEGER,
  PRIMARY KEY (task_id, student_id)
);

-- Student reward state — server is source of truth
CREATE TABLE IF NOT EXISTS student_state (
  student_id TEXT PRIMARY KEY,
  coins INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  focus_minutes_today INTEGER DEFAULT 0,
  last_focus_date TEXT DEFAULT ''
);

-- n8n dedup store — ensures notification fires exactly once
CREATE TABLE IF NOT EXISTS n8n_sent (
  session_id TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL
);

-- Server sequence counter for efficient delta pulls
CREATE TABLE IF NOT EXISTS server_seq (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_seq INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_operations_student_seq ON operations(student_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_operations_device ON operations(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_tasks_student ON tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON tasks(task_id);

INSERT OR IGNORE INTO server_seq (id, current_seq) VALUES (1, 0);
INSERT OR IGNORE INTO student_state (student_id, coins, streak_days, focus_minutes_today, last_focus_date)
VALUES ('student-001', 0, 0, 0, '');
