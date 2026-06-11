import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ClientDB } from '../db/client-db';
import { OperationQueue } from '../sync/op-queue';
import { LamportClock } from '../sync/lamport';
import { Subject, Task, TaskStatus } from '../types/index';

interface Return {
  subjects: Subject[];
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  addTask: (chapterId: string, title: string) => void;
  pendingOpsCount: number;
}

function recalcProgress(subjects: Subject[]): Subject[] {
  return subjects.map(s => ({
    ...s,
    chapters: s.chapters.map(ch => {
      const active = ch.tasks.filter(t => !t.deleted);
      const done = active.filter(t => t.status === 'done').length;
      return { ...ch, progress: active.length > 0 ? done / active.length : 0 };
    }),
    progress: (() => {
      const allActive = s.chapters.flatMap(ch => ch.tasks.filter(t => !t.deleted));
      const allDone = allActive.filter(t => t.status === 'done').length;
      return allActive.length > 0 ? allDone / allActive.length : 0;
    })(),
  }));
}

export function useSyllabus(db: ClientDB, queue: OperationQueue, clock: LamportClock, deviceId: string): Return {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pendingOpsCount, setPendingOpsCount] = useState(0);

  const load = useCallback(() => {
    db.initializeSubjectsIfEmpty();
    const raw = db.getSubjects();
    setSubjects(recalcProgress(raw));
    setPendingOpsCount(db.getPendingOps().filter((o: any) => !o.synced).length);
  }, [db]);

  useEffect(() => { load(); }, [load]);

  const updateTaskStatus = useCallback((taskId: string, status: TaskStatus) => {
    const allSubjects = db.getSubjects();
    let found: { subjectId: string; chapterId: string; title: string } | null = null;
    for (const s of allSubjects) {
      for (const ch of s.chapters) {
        const t = ch.tasks.find(t => t.task_id === taskId);
        if (t) { found = { subjectId: s.subject_id, chapterId: ch.chapter_id, title: t.title }; break; }
      }
      if (found) break;
    }
    if (!found) return;

    const lamport = clock.tick();
    const updatedSubjects = allSubjects.map(s => ({
      ...s,
      chapters: s.chapters.map(ch => ({
        ...ch,
        tasks: ch.tasks.map(t => t.task_id === taskId ? { ...t, status, lamport_clock: lamport, device_id: deviceId } : t),
      })),
    }));
    db.saveSubjects(updatedSubjects);
    db.saveTask({ task_id: taskId, chapter_id: found.chapterId, subject_id: found.subjectId, student_id: 'student-001', title: found.title, status, lamport_clock: lamport, device_id: deviceId, deleted: false });
    queue.enqueue('TASK_UPDATE', { task_id: taskId, status, chapter_id: found.chapterId, subject_id: found.subjectId, title: found.title });
    load();
  }, [db, queue, clock, deviceId, load]);

  const deleteTask = useCallback((taskId: string) => {
    const allSubjects = db.getSubjects();
    let found: { subjectId: string; chapterId: string; title: string } | null = null;
    for (const s of allSubjects) {
      for (const ch of s.chapters) {
        const t = ch.tasks.find(t => t.task_id === taskId);
        if (t) { found = { subjectId: s.subject_id, chapterId: ch.chapter_id, title: t.title }; break; }
      }
      if (found) break;
    }
    if (!found) return;

    const lamport = clock.tick();
    const updatedSubjects = allSubjects.map(s => ({
      ...s,
      chapters: s.chapters.map(ch => ({
        ...ch,
        tasks: ch.tasks.map(t => t.task_id === taskId ? { ...t, deleted: true, deleted_lamport: lamport } : t),
      })),
    }));
    db.saveSubjects(updatedSubjects);
    db.deleteTask(taskId, lamport, deviceId);
    queue.enqueue('TASK_DELETE', { task_id: taskId, chapter_id: found.chapterId, subject_id: found.subjectId, title: found.title });
    load();
  }, [db, queue, clock, deviceId, load]);

  const addTask = useCallback((chapterId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const allSubjects = db.getSubjects();
    let subjectId = '';
    for (const s of allSubjects) {
      for (const ch of s.chapters) {
        if (ch.chapter_id === chapterId) { subjectId = s.subject_id; break; }
      }
      if (subjectId) break;
    }
    if (!subjectId) return;

    const taskId = `task-${uuidv4()}`;
    const lamport = clock.tick();

    const newTask: Task = {
      task_id: taskId, chapter_id: chapterId, subject_id: subjectId,
      student_id: 'student-001', title: trimmed, status: 'not_started',
      lamport_clock: lamport, device_id: deviceId, deleted: false,
    };

    const updatedSubjects = allSubjects.map(s => ({
      ...s,
      chapters: s.chapters.map(ch => ch.chapter_id !== chapterId ? ch : {
        ...ch,
        tasks: [...ch.tasks, newTask],
      }),
    }));

    db.saveSubjects(updatedSubjects);
    db.saveTask(newTask);
    // Reuse TASK_UPDATE — server treats it as an upsert (new task_id = insert)
    queue.enqueue('TASK_UPDATE', { task_id: taskId, status: 'not_started', chapter_id: chapterId, subject_id: subjectId, title: trimmed });
    load();
  }, [db, queue, clock, deviceId, load]);

  return { subjects, updateTaskStatus, deleteTask, addTask, pendingOpsCount };
}
