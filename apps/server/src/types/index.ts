export type OpType = 'SESSION_START' | 'SESSION_SUCCESS' | 'SESSION_FAIL' | 'TASK_UPDATE' | 'TASK_DELETE';

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

export interface SyncPushPayload {
  student_id: string;
  device_id: string;
  operations: Operation[];
  last_server_seq: number;
}

export interface SyncPullResponse {
  operations: Operation[];
  server_seq: number;
  student_state: any;
  sessions: any[];
  tasks: any[];
}
