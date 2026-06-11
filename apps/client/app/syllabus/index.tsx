import React, { useContext, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, Platform, Animated } from 'react-native';
import { DeviceContext } from '../../src/store/device-store';
import { useSyllabus } from '../../src/hooks/useSyllabus';
import { useSync } from '../../src/hooks/useSync';
import { TaskStatus } from '../../src/types/index';
import { FONT_DISPLAY, webBlur } from '../../src/theme';
import { SERVER_URL } from '../../src/config';

const THEME = {
  bg: '#0a0a1a', surface: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.07)',
  purple: '#7c3aed', violet: '#8b5cf6', cyan: '#06b6d4', rose: '#f43f5e',
  gold: '#f59e0b', green: '#10b981', text: '#f1f5f9', muted: '#64748b', muted2: '#94a3b8',
};

const STATUS_META: { [k in TaskStatus]: { label: string; color: string; bg: string; next: TaskStatus; icon: string } } = {
  not_started: { label: 'Not Started', color: '#475569', bg: 'rgba(71,85,105,0.15)', next: 'in_progress', icon: '○' },
  in_progress:  { label: 'In Progress', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', next: 'done',       icon: '◑' },
  done:         { label: 'Done',        color: '#10b981', bg: 'rgba(16,185,129,0.15)', next: 'not_started', icon: '●' },
};

const SUBJECT_ACCENTS = ['#7c3aed', '#06b6d4', '#f43f5e'];

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ height: 4, width: `${Math.round(progress * 100)}%` as any, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function AddTaskRow({ chapterId, onAdd }: { chapterId: string; onAdd: (chapterId: string, title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openInput = () => {
    setOpen(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  const submit = () => {
    if (!value.trim()) return;
    onAdd(chapterId, value);
    setValue('');
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setOpen(false));
  };

  const cancel = () => {
    setValue('');
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setOpen(false));
  };

  if (!open) {
    return (
      <TouchableOpacity style={addStyles.addBtn} onPress={openInput} activeOpacity={0.7}>
        <Text style={addStyles.addIcon}>+</Text>
        <Text style={addStyles.addTxt}>Add task</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View style={[addStyles.inputRow, { opacity: fadeAnim }]}>
      <TextInput
        style={addStyles.input}
        placeholder="Task title…"
        placeholderTextColor="#334155"
        value={value}
        onChangeText={setValue}
        autoFocus
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <TouchableOpacity style={addStyles.confirmBtn} onPress={submit} activeOpacity={0.8}>
        <Text style={addStyles.confirmTxt}>Add</Text>
      </TouchableOpacity>
      <TouchableOpacity style={addStyles.cancelBtn} onPress={cancel} activeOpacity={0.8}>
        <Text style={addStyles.cancelTxt}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const addStyles = StyleSheet.create({
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, gap: 6, opacity: 0.55 },
  addIcon: { fontSize: 14, color: '#8b5cf6', fontWeight: '700' },
  addTxt: { fontSize: 12, color: '#8b5cf6', fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  input: {
    flex: 1, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, fontSize: 13, color: '#f1f5f9',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  confirmBtn: { backgroundColor: 'rgba(124,58,237,0.8)', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  confirmTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cancelBtn: { padding: 6 },
  cancelTxt: { color: '#475569', fontSize: 13, fontWeight: '600' },
});

export default function SyllabusScreen() {
  const store = useContext(DeviceContext)!;
  const { subjects, updateTaskStatus, deleteTask, addTask, pendingOpsCount } = useSyllabus(store.db, store.queue, store.clock, store.deviceId);
  const { isSyncing, isOnline, manualSync, lastSyncTime } = useSync(store.syncEngine, SERVER_URL);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const handleDelete = (taskId: string) => {
    Alert.alert('Delete Task?', 'This action is synced to all devices.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTask(taskId) },
    ]);
  };

  const overallProgress = subjects.length
    ? subjects.reduce((s, x) => s + x.progress, 0) / subjects.length
    : 0;

  const totalTasks = subjects.flatMap(s => s.chapters.flatMap(c => c.tasks.filter(t => !t.deleted))).length;
  const doneTasks  = subjects.flatMap(s => s.chapters.flatMap(c => c.tasks.filter(t => !t.deleted && t.status === 'done'))).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Syllabus</Text>
          <Text style={styles.pageSub}>{doneTasks}/{totalTasks} tasks · {Math.round(overallProgress * 100)}% complete</Text>
        </View>
        <View style={styles.badgeRow}>
          {pendingOpsCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>⚠ {pendingOpsCount} unsynced</Text>
            </View>
          )}
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? THEME.green : THEME.rose }]} />
        </View>
      </View>

      <View style={styles.overallBar}>
        <ProgressBar progress={overallProgress} color={THEME.violet} />
      </View>

      {subjects.map((subject, si) => {
        const accent = SUBJECT_ACCENTS[si % SUBJECT_ACCENTS.length];
        const isExpanded = expanded[subject.subject_id];
        return (
          <View key={subject.subject_id} style={[styles.subjectCard, { borderColor: `${accent}25` }]}>
            <TouchableOpacity style={styles.subjectHeader} onPress={() => toggle(subject.subject_id)} activeOpacity={0.8}>
              <View style={[styles.subjectDot, { backgroundColor: accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.subjectTitle}>{subject.title}</Text>
                <Text style={[styles.subjectPct, { color: accent }]}>{Math.round(subject.progress * 100)}% complete</Text>
              </View>
              <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            <ProgressBar progress={subject.progress} color={accent} />

            {isExpanded && subject.chapters.map(chapter => {
              const chKey = chapter.chapter_id;
              const chExpanded = expanded[chKey];
              const activeTasks = chapter.tasks.filter(t => !t.deleted);
              return (
                <View key={chKey} style={styles.chapterWrap}>
                  <TouchableOpacity style={styles.chapterHeader} onPress={() => toggle(chKey)} activeOpacity={0.8}>
                    <View style={[styles.chapterDot, { backgroundColor: `${accent}80` }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chapterTitle}>{chapter.title}</Text>
                      <Text style={styles.chapterPct}>{activeTasks.filter(t => t.status === 'done').length}/{activeTasks.length} · {Math.round(chapter.progress * 100)}%</Text>
                    </View>
                    <Text style={styles.chevron}>{chExpanded ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  <ProgressBar progress={chapter.progress} color={`${accent}70`} />

                  {chExpanded && (
                    <View style={styles.taskList}>
                      {activeTasks.length === 0 && (
                        <Text style={styles.emptyTasks}>No tasks yet — add one below</Text>
                      )}
                      {activeTasks.map(task => {
                        const meta = STATUS_META[task.status];
                        return (
                          <View key={task.task_id} style={styles.taskRow}>
                            <TouchableOpacity
                              style={[styles.statusBadge, { backgroundColor: meta.bg, borderColor: `${meta.color}50` }]}
                              onPress={() => updateTaskStatus(task.task_id, meta.next)}
                              activeOpacity={0.75}
                            >
                              <Text style={[styles.statusIcon, { color: meta.color }]}>{meta.icon}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.taskTitle, task.status === 'done' && styles.taskTitleDone]} numberOfLines={1}>
                              {task.title}
                            </Text>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(task.task_id)}>
                              <Text style={styles.deleteTxt}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                      <AddTaskRow chapterId={chapter.chapter_id} onAdd={addTask} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}

      <TouchableOpacity style={styles.syncBtn} onPress={manualSync} disabled={isSyncing} activeOpacity={0.8}>
        <Text style={styles.syncBtnText}>
          {isSyncing ? '⟳ Syncing…' : `⇅ Sync${lastSyncTime ? ' · ' + new Date(lastSyncTime).toLocaleTimeString() : ''}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  pageTitle: { fontSize: 28, fontWeight: '700', color: '#f5f6fb', fontFamily: FONT_DISPLAY, letterSpacing: -0.8 },
  pageSub: { fontSize: 13, color: '#6b7390', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingBadge: { backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 20, paddingVertical: 3, paddingHorizontal: 9 },
  pendingText: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  overallBar: { marginBottom: 24 },
  subjectCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderRadius: 18,
    marginBottom: 14, overflow: 'hidden', ...webBlur(10),
  },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 12 },
  subjectDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  subjectTitle: { fontSize: 16.5, fontWeight: '700', color: '#f5f6fb', fontFamily: FONT_DISPLAY },
  subjectPct: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  chevron: { fontSize: 11, color: '#475569' },
  chapterWrap: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 2 },
  chapterHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  chapterDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 10 },
  chapterTitle: { fontSize: 13, fontWeight: '700', color: '#cbd5e1' },
  chapterPct: { fontSize: 11, color: '#475569', marginTop: 1 },
  taskList: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4 },
  emptyTasks: { fontSize: 12, color: '#334155', fontStyle: 'italic', paddingVertical: 8, paddingHorizontal: 4 },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 8 },
  statusBadge: { width: 28, height: 28, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  statusIcon: { fontSize: 13, fontWeight: '700' },
  taskTitle: { flex: 1, fontSize: 13, color: '#94a3b8' },
  taskTitleDone: { color: '#334155', textDecorationLine: 'line-through' },
  deleteBtn: { padding: 6 },
  deleteTxt: { fontSize: 12, color: '#334155' },
  syncBtn: { marginTop: 24, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.07)' },
  syncBtnText: { fontSize: 13, color: '#8b5cf6', fontWeight: '600' },
});
