// Operation types for the sync queue
export type OpType =
  | 'SESSION_START'
  | 'SESSION_SUCCESS'
  | 'SESSION_FAIL'
  | 'TASK_UPDATE'
  | 'TASK_DELETE';

// A single operation in the pending queue
export interface Operation {
  op_id: string;
  student_id: string;
  device_id: string;
  op_type: OpType;
  payload: Record<string, unknown>;
  lamport_clock: number;
  created_at: number;
  synced: boolean;
}

// Focus session
export interface FocusSession {
  session_id: string;
  student_id: string;
  device_id: string;
  target_minutes: number;
  started_at: number;
  completed_at?: number;
  status: 'running' | 'success' | 'failed';
  fail_reason?: 'give_up' | 'app_switch';
  reward_granted: boolean;
  notified: boolean;
}

// Task status
export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface Task {
  task_id: string;
  chapter_id: string;
  subject_id: string;
  student_id: string;
  title: string;
  status: TaskStatus;
  lamport_clock: number;
  device_id: string;
  deleted: boolean;
  deleted_lamport?: number;
}

export interface Chapter {
  chapter_id: string;
  subject_id: string;
  title: string;
  tasks: Task[];
  progress: number;
}

export interface Subject {
  subject_id: string;
  student_id: string;
  title: string;
  chapters: Chapter[];
  progress: number;
}

// Student reward state
export interface StudentState {
  student_id: string;
  coins: number;
  streak_days: number;
  focus_minutes_today: number;
  last_focus_date: string;
}

// Sync payload structures
export interface SyncPushPayload {
  student_id: string;
  device_id: string;
  operations: Operation[];
  last_server_seq: number;
}

export interface SyncPullResponse {
  operations: Operation[];
  server_seq: number;
  student_state: StudentState;
  sessions: FocusSession[];
  tasks: Task[];
}

// Dev panel network state
export interface DeviceNetworkState {
  device_id: string;
  online: boolean;
}
