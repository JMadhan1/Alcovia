import React, { useContext, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { DeviceContext } from '../../src/store/device-store';
import { ClientDB } from '../../src/db/client-db';
import { SyncEngine } from '../../src/sync/sync-engine';
import { OperationQueue } from '../../src/sync/op-queue';
import { LamportClock } from '../../src/sync/lamport';
import { isOnline as gateIsOnline, setOnline as gateSetOnline } from '../../src/sync/network';
import { FONT_DISPLAY, webBlur } from '../../src/theme';
import { SERVER_URL } from '../../src/config';

const THEME = {
  bg: 'transparent', purple: '#8b5cf6', violet: '#8b5cf6',
  cyan: '#2dd4bf', rose: '#fb7185', gold: '#fbbf24',
  green: '#34d399', text: '#f5f6fb', muted: '#6b7390',
};

interface DevState {
  lamport: number; pendingOps: number; coins: number; streak: number;
  online: boolean; lastSync: string;
}

const defaultState = (): DevState => ({ lamport: 0, pendingOps: 0, coins: 0, streak: 0, online: true, lastSync: '—' });

function readDeviceState(deviceId: string): DevState {
  try {
    const db = new ClientDB(deviceId);
    const state = db.getStudentState();
    const pending = db.getPendingOps().filter((o: any) => !o.synced).length;
    return {
      lamport: db.getLamportClock(),
      pendingOps: pending,
      coins: state.coins,
      streak: state.streak_days,
      online: gateIsOnline(deviceId),
      lastSync: db.getLastServerSeq() > 0 ? `seq ${db.getLastServerSeq()}` : '—',
    };
  } catch { return defaultState(); }
}

interface NotifEntry {
  session_id: string; student_id: string; streak_days: number; coins_earned: number;
  fired_at: number; source_device: string; duplicate_blocked: boolean;
}

function StateCard({ deviceId, state, accent }: { deviceId: string; state: DevState; accent: string }) {
  return (
    <View style={[cardStyles.wrap, { borderColor: `${accent}25` }]}>
      <View style={cardStyles.header}>
        <View style={[cardStyles.dot, { backgroundColor: accent }]} />
        <Text style={cardStyles.title}>{deviceId}</Text>
        <View style={[cardStyles.online, { backgroundColor: state.online ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)', borderColor: state.online ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)' }]}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: state.online ? '#10b981' : '#f43f5e' }}>
            {state.online ? '● ONLINE' : '○ OFFLINE'}
          </Text>
        </View>
      </View>
      <View style={cardStyles.grid}>
        <View style={cardStyles.cell}><Text style={cardStyles.val}>{state.coins}</Text><Text style={cardStyles.key}>Coins</Text></View>
        <View style={cardStyles.cell}><Text style={cardStyles.val}>{state.streak}</Text><Text style={cardStyles.key}>Streak</Text></View>
        <View style={cardStyles.cell}><Text style={cardStyles.val}>{state.pendingOps}</Text><Text style={cardStyles.key}>Pending</Text></View>
        <View style={cardStyles.cell}><Text style={cardStyles.val}>{state.lamport}</Text><Text style={cardStyles.key}>Lamport</Text></View>
      </View>
      <Text style={cardStyles.syncLine}>Last sync: {state.lastSync}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', padding: 16, marginBottom: 10, ...webBlur(10) },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#f5f6fb', fontFamily: FONT_DISPLAY },
  online: { borderWidth: 1, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  grid: { flexDirection: 'row', marginBottom: 8 },
  cell: { flex: 1, alignItems: 'center' },
  val: { fontSize: 22, fontWeight: '700', color: '#f5f6fb', fontFamily: FONT_DISPLAY },
  key: { fontSize: 10, color: '#6b7390', marginTop: 2, fontWeight: '600', letterSpacing: 0.3 },
  syncLine: { fontSize: 11, color: '#334155', textAlign: 'right' },
});

export default function DevPanelScreen() {
  const store = useContext(DeviceContext)!;
  const [stateA, setStateA] = useState(defaultState);
  const [stateB, setStateB] = useState(defaultState);
  const [notifLog, setNotifLog] = useState<NotifEntry[]>([]);
  const [opsLog, setOpsLog] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const addLog = (msg: string) => setOpsLog(l => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...l].slice(0, 30));

  const refresh = useCallback(() => {
    setStateA(readDeviceState('device-A'));
    setStateB(readDeviceState('device-B'));
  }, []);

  useEffect(() => { refresh(); }, [refreshTick]);
  useEffect(() => { const t = setInterval(() => setRefreshTick(n => n + 1), 2000); return () => clearInterval(t); }, []);

  const fetchNotifLog = async () => {
    try {
      const r = await fetch(`${SERVER_URL}/webhook/notify-log`);
      setNotifLog(await r.json());
    } catch { }
  };
  useEffect(() => { fetchNotifLog(); const t = setInterval(fetchNotifLog, 3000); return () => clearInterval(t); }, []);

  const toggleOnline = async (deviceId: string) => {
    const next = !gateIsOnline(deviceId);
    gateSetOnline(deviceId, next);
    addLog(`${deviceId} → ${next ? 'ONLINE' : 'OFFLINE'}`);
    refresh();

    if (next) {
      // Trigger sync on reconnect
      try {
        const db = new ClientDB(deviceId);
        const clock = new LamportClock(deviceId);
        const queue = new OperationQueue(db, clock, deviceId);
        const engine = new SyncEngine(db, queue, clock, deviceId, SERVER_URL);
        await engine.sync();
        addLog(`${deviceId} synced on reconnect ✓`);
        refresh();
      } catch (e: any) { addLog(`${deviceId} sync error: ${e.message}`); }
    }
  };

  const runSync = async (deviceId: string) => {
    addLog(`Syncing ${deviceId}…`);
    try {
      const db = new ClientDB(deviceId);
      const clock = new LamportClock(deviceId);
      const queue = new OperationQueue(db, clock, deviceId);
      const engine = new SyncEngine(db, queue, clock, deviceId, SERVER_URL);
      await engine.sync();
      addLog(`${deviceId} sync complete ✓`);
      refresh();
    } catch (e: any) { addLog(`${deviceId} sync error: ${e.message}`); }
  };

  const runBothSync = async () => {
    await runSync('device-A');
    await runSync('device-B');
  };

  const scenario_conflictTask = async () => {
    addLog('📋 Scenario: conflicting task edits');
    const dbA = new ClientDB('device-A'), clkA = new LamportClock('device-A'), qA = new OperationQueue(dbA, clkA, 'device-A');
    const dbB = new ClientDB('device-B'), clkB = new LamportClock('device-B'), qB = new OperationQueue(dbB, clkB, 'device-B');

    qA.enqueue('TASK_UPDATE', { task_id: 'math-task-01', subject_id: 'math-001', chapter_id: 'math-ch-01', title: 'Solve linear equations', status: 'done' });
    qB.enqueue('TASK_UPDATE', { task_id: 'math-task-01', subject_id: 'math-001', chapter_id: 'math-ch-01', title: 'Solve linear equations', status: 'in_progress' });
    addLog('Device A set task → done | Device B set task → in_progress (conflict)');
    addLog('→ Higher Lamport wins; both devices will converge on same value after sync');
    refresh();
  };

  const scenario_editVsDelete = async () => {
    addLog('🗑 Scenario: edit-vs-delete');
    const dbA = new ClientDB('device-A'), clkA = new LamportClock('device-A'), qA = new OperationQueue(dbA, clkA, 'device-A');
    const dbB = new ClientDB('device-B'), clkB = new LamportClock('device-B'), qB = new OperationQueue(dbB, clkB, 'device-B');

    qA.enqueue('TASK_UPDATE', { task_id: 'phys-task-01', subject_id: 'phys-001', chapter_id: 'phys-ch-01', title: "Newton's laws", status: 'in_progress' });
    qB.enqueue('TASK_DELETE', { task_id: 'phys-task-01', subject_id: 'phys-001', chapter_id: 'phys-ch-01', title: "Newton's laws" });
    addLog('Device A edited phys-task-01 | Device B deleted phys-task-01');
    addLog('→ Delete wins if Lamport(delete) ≥ Lamport(edit) — tombstone propagates');
    refresh();
  };

  const scenario_offlineFocus = async () => {
    addLog('🔒 Scenario: offline focus sessions');
    addLog('1. Go to Focus tab on each device while offline');
    addLog('2. Complete a session on each device');
    addLog('3. Come back here and toggle both devices online');
    addLog('4. Sessions sync — reward granted exactly once per session');
    addLog('5. n8n notification fires exactly once (deduped by session_id)');
  };

  const clearServerDB = async () => {
    Alert.alert('Reset Everything?', 'Wipes the server DB and both device namespaces in local storage. Cannot undo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        try {
          await fetch(`${SERVER_URL}/dev/reset`, { method: 'POST' });
          // Clear both device namespaces locally (keep the online flags).
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('device-A:') || k.startsWith('device-B:'))) keys.push(k);
          }
          keys.forEach((k) => localStorage.removeItem(k));
          gateSetOnline('device-A', true);
          gateSetOnline('device-B', true);
          addLog('Full reset: server DB + both device namespaces cleared.');
          setNotifLog([]);
          refresh();
        } catch (e: any) { addLog('Reset failed: ' + e.message); }
      }},
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Dev Panel</Text>
      <Text style={styles.pageSub}>Conflict scenarios · Sync control · State inspector</Text>

      {/* State cards */}
      <View style={styles.cardRow}>
        <View style={styles.cardCol}><StateCard deviceId="device-A" state={stateA} accent={THEME.violet} /></View>
        <View style={styles.cardCol}><StateCard deviceId="device-B" state={stateB} accent={THEME.cyan} /></View>
      </View>

      {/* Online toggles */}
      <Text style={styles.sectionLabel}>NETWORK CONTROL</Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.halfBtn, { borderColor: stateA.online ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.4)', backgroundColor: stateA.online ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.08)' }]} onPress={() => toggleOnline('device-A')} activeOpacity={0.8}>
          <Text style={{ color: stateA.online ? THEME.rose : THEME.green, fontWeight: '700', fontSize: 13 }}>
            {stateA.online ? '⊘ Go Offline A' : '⊕ Go Online A'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.halfBtn, { borderColor: stateB.online ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.4)', backgroundColor: stateB.online ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.08)' }]} onPress={() => toggleOnline('device-B')} activeOpacity={0.8}>
          <Text style={{ color: stateB.online ? THEME.rose : THEME.green, fontWeight: '700', fontSize: 13 }}>
            {stateB.online ? '⊘ Go Offline B' : '⊕ Go Online B'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sync buttons */}
      <Text style={styles.sectionLabel}>SYNC</Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.halfBtn, { borderColor: 'rgba(124,58,237,0.4)', backgroundColor: 'rgba(124,58,237,0.08)' }]} onPress={() => runSync('device-A')} activeOpacity={0.8}>
          <Text style={{ color: THEME.violet, fontWeight: '700', fontSize: 13 }}>⇅ Sync A</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.halfBtn, { borderColor: 'rgba(6,182,212,0.4)', backgroundColor: 'rgba(6,182,212,0.08)' }]} onPress={() => runSync('device-B')} activeOpacity={0.8}>
          <Text style={{ color: THEME.cyan, fontWeight: '700', fontSize: 13 }}>⇅ Sync B</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.fullBtn} onPress={runBothSync} activeOpacity={0.8}>
        <Text style={styles.fullBtnText}>⇅ Sync Both Devices</Text>
      </TouchableOpacity>

      {/* Conflict scenarios */}
      <Text style={styles.sectionLabel}>CONFLICT SCENARIOS</Text>
      <TouchableOpacity style={styles.scenarioBtn} onPress={scenario_conflictTask} activeOpacity={0.8}>
        <Text style={styles.scenarioTitle}>📋 Conflicting Task Status</Text>
        <Text style={styles.scenarioDesc}>A → done, B → in_progress on same task</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.scenarioBtn} onPress={scenario_editVsDelete} activeOpacity={0.8}>
        <Text style={styles.scenarioTitle}>🗑 Edit vs Delete</Text>
        <Text style={styles.scenarioDesc}>A edits, B deletes the same task</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.scenarioBtn} onPress={scenario_offlineFocus} activeOpacity={0.8}>
        <Text style={styles.scenarioTitle}>🔒 Offline Focus Sessions</Text>
        <Text style={styles.scenarioDesc}>Complete focus sessions on both devices while offline</Text>
      </TouchableOpacity>

      {/* n8n log */}
      <Text style={styles.sectionLabel}>N8N NOTIFICATIONS (exactly-once)</Text>
      {notifLog.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>No notifications fired yet. Complete a focus session to trigger one.</Text></View>
      ) : [...notifLog].reverse().map((n, i) => {
        const blocked = n.duplicate_blocked;
        return (
          <View key={i} style={[styles.notifItem, blocked && { backgroundColor: 'rgba(244,63,94,0.06)', borderColor: 'rgba(244,63,94,0.25)' }]}>
            <Text style={styles.notifIcon}>{blocked ? '🚫' : '📢'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.notifTitle, blocked && { color: '#fda4af' }]}>
                {blocked
                  ? `Session ${n.session_id.slice(0, 8)} — duplicate from ${n.source_device}`
                  : `Session ${n.session_id.slice(0, 8)} — Streak ${n.streak_days} · +${n.coins_earned} coins (${n.source_device})`}
              </Text>
              <Text style={styles.notifTime}>{new Date(n.fired_at).toLocaleTimeString()}</Text>
            </View>
            <View style={[styles.onceBadge, blocked && { backgroundColor: 'rgba(244,63,94,0.15)' }]}>
              <Text style={[styles.onceText, blocked && { color: '#fb7185' }]}>{blocked ? 'BLOCKED' : 'SENT'}</Text>
            </View>
          </View>
        );
      })}

      {/* Ops log */}
      {opsLog.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>OPS LOG</Text>
          <View style={styles.logBox}>
            {opsLog.map((l, i) => <Text key={i} style={styles.logLine}>{l}</Text>)}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '700', color: '#f5f6fb', marginBottom: 4, fontFamily: FONT_DISPLAY, letterSpacing: -0.8 },
  pageSub: { fontSize: 13, color: '#6b7390', marginBottom: 22 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#6b7390', letterSpacing: 2, marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  halfBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  fullBtn: { borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)', backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  fullBtnText: { color: '#8b5cf6', fontWeight: '700', fontSize: 13 },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: -5 },
  cardCol: { flexGrow: 1, flexBasis: 240, paddingHorizontal: 5 },
  scenarioBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 8, ...webBlur(8) },
  scenarioTitle: { fontSize: 14, fontWeight: '700', color: '#e6e9f2', marginBottom: 3 },
  scenarioDesc: { fontSize: 12, color: '#475569' },
  emptyBox: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  emptyText: { fontSize: 12, color: '#334155', textAlign: 'center' },
  notifItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', borderRadius: 10, padding: 12, marginBottom: 6 },
  notifIcon: { fontSize: 18, marginRight: 10 },
  notifTitle: { fontSize: 12, fontWeight: '600', color: '#a7f3d0' },
  notifTime: { fontSize: 10, color: '#064e3b', marginTop: 2 },
  onceBadge: { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  onceText: { fontSize: 9, fontWeight: '800', color: '#10b981', letterSpacing: 0.5 },
  logBox: { backgroundColor: '#050510', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  logLine: { fontSize: 10, color: '#475569', fontFamily: 'monospace', marginBottom: 3, lineHeight: 14 },
});
