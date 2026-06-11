import { v4 as uuidv4 } from 'uuid';
import {
  StudentState,
  FocusSession,
  Operation,
  Task,
  TaskStatus,
  Subject,
  Chapter,
} from '../types';

const SEED_SUBJECTS = [
  {
    subject_id: 'math-001',
    title: 'Mathematics',
    chapters: [
      {
        chapter_id: 'math-ch-01',
        title: 'Algebra',
        tasks: [
          { task_id: 'math-task-01', title: 'Solve linear equations' },
          { task_id: 'math-task-02', title: 'Quadratic formula' },
          { task_id: 'math-task-03', title: 'Systems of equations' },
        ],
      },
      {
        chapter_id: 'math-ch-02',
        title: 'Geometry',
        tasks: [
          { task_id: 'math-task-04', title: 'Triangle theorems' },
          { task_id: 'math-task-05', title: 'Circle properties' },
          { task_id: 'math-task-06', title: 'Coordinate geometry' },
        ],
      },
    ],
  },
  {
    subject_id: 'phys-001',
    title: 'Physics',
    chapters: [
      {
        chapter_id: 'phys-ch-01',
        title: 'Mechanics',
        tasks: [
          { task_id: 'phys-task-01', title: "Newton's laws" },
          { task_id: 'phys-task-02', title: 'Work and energy' },
          { task_id: 'phys-task-03', title: 'Momentum' },
        ],
      },
      {
        chapter_id: 'phys-ch-02',
        title: 'Waves',
        tasks: [
          { task_id: 'phys-task-04', title: 'Wave properties' },
          { task_id: 'phys-task-05', title: 'Sound waves' },
          { task_id: 'phys-task-06', title: 'Light and optics' },
        ],
      },
    ],
  },
  {
    subject_id: 'chem-001',
    title: 'Chemistry',
    chapters: [
      {
        chapter_id: 'chem-ch-01',
        title: 'Atomic Structure',
        tasks: [
          { task_id: 'chem-task-01', title: 'Bohr model' },
          { task_id: 'chem-task-02', title: 'Electron configuration' },
          { task_id: 'chem-task-03', title: 'Periodic trends' },
        ],
      },
      {
        chapter_id: 'chem-ch-02',
        title: 'Chemical Bonding',
        tasks: [
          { task_id: 'chem-task-04', title: 'Ionic bonds' },
          { task_id: 'chem-task-05', title: 'Covalent bonds' },
          { task_id: 'chem-task-06', title: 'VSEPR theory' },
        ],
      },
    ],
  },
];

export class ClientDB {
  private ns: string;

  constructor(deviceId: string) {
    this.ns = `${deviceId}:`;
  }

  private key(k: string): string {
    return `${this.ns}${k}`;
  }

  getStudentState(): StudentState {
    const stored = localStorage.getItem(this.key('student_state'));
    if (!stored) {
      return {
        student_id: 'student-001',
        coins: 0,
        streak_days: 0,
        focus_minutes_today: 0,
        last_focus_date: '',
      };
    }
    return JSON.parse(stored);
  }

  setStudentState(state: StudentState): void {
    localStorage.setItem(this.key('student_state'), JSON.stringify(state));
  }

  getSession(sessionId: string): FocusSession | null {
    const stored = localStorage.getItem(this.key(`session_${sessionId}`));
    return stored ? JSON.parse(stored) : null;
  }

  saveSession(session: FocusSession): void {
    localStorage.setItem(this.key(`session_${session.session_id}`), JSON.stringify(session));
  }

  getAllSessions(): FocusSession[] {
    const sessions: FocusSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.key('session_'))) {
        const stored = localStorage.getItem(key);
        if (stored) {
          sessions.push(JSON.parse(stored));
        }
      }
    }
    return sessions.sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  }

  getTask(taskId: string): Task | null {
    const stored = localStorage.getItem(this.key(`task_${taskId}`));
    return stored ? JSON.parse(stored) : null;
  }

  saveTask(task: Task): void {
    localStorage.setItem(this.key(`task_${task.task_id}`), JSON.stringify(task));
  }

  getAllTasks(): Task[] {
    const tasks: Task[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.key('task_'))) {
        const stored = localStorage.getItem(key);
        if (stored) {
          tasks.push(JSON.parse(stored));
        }
      }
    }
    return tasks;
  }

  deleteTask(taskId: string, lamportClock: number, deviceId: string): void {
    const existing = this.getTask(taskId);
    if (existing) {
      this.saveTask({
        ...existing,
        deleted: true,
        deleted_lamport: lamportClock,
      });
    }
  }

  getSubjects(): Subject[] {
    const stored = localStorage.getItem(this.key('subjects'));
    return stored ? JSON.parse(stored) : [];
  }

  saveSubjects(subjects: Subject[]): void {
    localStorage.setItem(this.key('subjects'), JSON.stringify(subjects));
  }

  initializeSubjectsIfEmpty(): void {
    const existing = this.getSubjects();
    if (existing.length > 0) {
      return;
    }

    const subjects: Subject[] = SEED_SUBJECTS.map((seed) => ({
      subject_id: seed.subject_id,
      student_id: 'student-001',
      title: seed.title,
      chapters: seed.chapters.map((ch) => ({
        chapter_id: ch.chapter_id,
        subject_id: seed.subject_id,
        title: ch.title,
        progress: 0,
        tasks: ch.tasks.map((t) => ({
          task_id: t.task_id,
          chapter_id: ch.chapter_id,
          subject_id: seed.subject_id,
          student_id: 'student-001',
          title: t.title,
          status: 'not_started' as TaskStatus,
          lamport_clock: 0,
          device_id: '',
          deleted: false,
        })),
      })),
      progress: 0,
    }));

    this.saveSubjects(subjects);

    for (const subject of subjects) {
      for (const chapter of subject.chapters) {
        for (const task of chapter.tasks) {
          this.saveTask(task);
        }
      }
    }
  }

  getPendingOps(): Operation[] {
    const stored = localStorage.getItem(this.key('pending_ops'));
    return stored ? JSON.parse(stored) : [];
  }

  addPendingOp(op: Operation): void {
    const pending = this.getPendingOps();
    pending.push(op);
    localStorage.setItem(this.key('pending_ops'), JSON.stringify(pending));
  }

  markOpSynced(opId: string): void {
    const pending = this.getPendingOps();
    const op = pending.find((o) => o.op_id === opId);
    if (op) {
      op.synced = true;
      localStorage.setItem(this.key('pending_ops'), JSON.stringify(pending));
    }
  }

  clearSyncedOps(): void {
    const pending = this.getPendingOps().filter((op) => !op.synced);
    localStorage.setItem(this.key('pending_ops'), JSON.stringify(pending));
  }

  getLastServerSeq(): number {
    const stored = localStorage.getItem(this.key('last_server_seq'));
    return stored ? parseInt(stored, 10) : 0;
  }

  setLastServerSeq(seq: number): void {
    localStorage.setItem(this.key('last_server_seq'), String(seq));
  }

  getLamportClock(): number {
    const stored = localStorage.getItem(this.key('lamport_clock'));
    return stored !== null ? parseInt(stored, 10) : 0;
  }

  setLamportClock(value: number): void {
    localStorage.setItem(this.key('lamport_clock'), String(value));
  }

  // ---- Crash-recovery checkpoint (Extension: survive app restart mid-session) ----
  getSessionCheckpoint(): SessionCheckpoint | null {
    const stored = localStorage.getItem(this.key('session_checkpoint'));
    return stored ? JSON.parse(stored) : null;
  }

  setSessionCheckpoint(cp: SessionCheckpoint): void {
    localStorage.setItem(this.key('session_checkpoint'), JSON.stringify(cp));
  }

  clearSessionCheckpoint(): void {
    localStorage.removeItem(this.key('session_checkpoint'));
  }
}

export interface SessionCheckpoint {
  session_id: string;
  target_minutes: number;
  started_at: number;
  elapsed_seconds: number;
  checkpoint_at: number;
}
