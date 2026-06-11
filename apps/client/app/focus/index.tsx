import React, { useContext, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Animated, Platform } from 'react-native';
import { DeviceContext } from '../../src/store/device-store';
import { useFocusSession } from '../../src/hooks/useFocusSession';
import { useSync } from '../../src/hooks/useSync';
import { FONT_DISPLAY, webShadow, webBlur } from '../../src/theme';
import { SERVER_URL } from '../../src/config';

const DURATIONS = [5, 10, 15, 25, 45, 60, 90, 120];

const C = {
  bg: 'transparent', surface: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)',
  purple: '#8b5cf6', violet: '#8b5cf6', cyan: '#2dd4bf', rose: '#fb7185',
  gold: '#fbbf24', green: '#34d399', text: '#f5f6fb', muted: '#6b7390', muted2: '#aab2c5',
};

function formatTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

// Web-native SVG ring — no react-native-svg needed
function TimerRing({ progress, size, color, children }: { progress: number; size: number; color: string; children: React.ReactNode }) {
  const sw = 9;
  const r = (size - sw * 2) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, progress));

  if (Platform.OS === 'web') {
    return (
      <View style={{ width: size, height: size, alignSelf: 'center' }}>
        {/* @ts-ignore */}
        <svg width={size} height={size} style={{ position: 'absolute' as any }}>
          {/* @ts-ignore */}
          <circle cx={cx} cy={cx} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={sw} fill="none" />
          {/* @ts-ignore */}
          <circle cx={cx} cy={cx} r={r} stroke={color} strokeWidth={sw} fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cx})`} />
        </svg>
        <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          {children}
        </View>
      </View>
    );
  }

  // Fallback for native: filled circle
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}20`, borderWidth: sw, borderColor: color, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }}>
      {children}
    </View>
  );
}

function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <View style={[sS.card, { borderColor: `${color}30` }]}>
      <Text style={[sS.val, { color }]}>{value}</Text>
      <Text style={sS.lbl}>{label}</Text>
    </View>
  );
}
const sS = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, marginHorizontal: 5, ...webBlur(10) },
  val: { fontSize: 26, fontWeight: '700', fontFamily: FONT_DISPLAY, letterSpacing: -0.5 },
  lbl: { fontSize: 10.5, color: '#6b7390', marginTop: 3, fontWeight: '600', letterSpacing: 0.5 },
});

export default function FocusScreen() {
  const store = useContext(DeviceContext)!;
  const { isSyncing, isOnline, lastSyncTime, manualSync } = useSync(store.syncEngine, SERVER_URL);
  const { activeSession, timeRemaining, graceCountdown, sessions, startSession, giveUp, clearSession, wasResumed, studentState } =
    useFocusSession(store.db, store.queue, store.deviceId);

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (activeSession?.status === 'running') {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.035, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [activeSession?.status]);

  const isRunning = activeSession?.status === 'running';
  const isDone = activeSession && activeSession.status !== 'running';
  const totalSecs = activeSession ? activeSession.target_minutes * 60 : 1;
  const ringProgress = isRunning ? timeRemaining / totalSecs
    : isDone ? (activeSession.status === 'success' ? 1 : 0.15) : 0;
  const ringColor = isDone
    ? (activeSession.status === 'success' ? C.green : C.rose)
    : C.purple;

  const handleGiveUp = () => Alert.alert('Give Up?', 'End session without reward.', [
    { text: 'Stay Focused', style: 'cancel' },
    { text: 'Give Up', style: 'destructive', onPress: giveUp },
  ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* Status pill */}
      <View style={[styles.pill, { backgroundColor: isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', borderColor: isOnline ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)' }]}>
        <View style={[styles.dot, { backgroundColor: isOnline ? C.green : C.rose }]} />
        <Text style={[styles.pillTxt, { color: isOnline ? C.green : C.rose }]}>
          {isSyncing ? '⟳ Syncing…' : isOnline ? 'Online' : 'Offline — changes queued locally'}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard value={studentState.coins} label="🪙 COINS" color={C.gold} />
        <StatCard value={studentState.streak_days} label="🔥 STREAK" color={C.rose} />
        <StatCard value={studentState.focus_minutes_today} label="⏱ TODAY" color={C.cyan} />
      </View>

      {/* Running */}
      {isRunning && (
        <View style={styles.center}>
          {wasResumed && (
            <View style={styles.resumeBanner}>
              <Text style={styles.resumeText}>↻ Session resumed after restart</Text>
            </View>
          )}
          {graceCountdown !== null && (
            <View style={styles.graceBanner}>
              <Text style={styles.graceText}>⚠ App switched · failing in {graceCountdown}s</Text>
            </View>
          )}
          <Animated.View style={[{ transform: [{ scale: pulseAnim }], borderRadius: 130 }, webShadow('rgba(139,92,246,0.45)', 70)]}>
            <TimerRing progress={ringProgress} size={240} color={C.purple}>
              <Text style={styles.timerBig}>{formatTime(timeRemaining)}</Text>
              <Text style={styles.timerSub}>{activeSession!.target_minutes}m goal</Text>
            </TimerRing>
          </Animated.View>
          <Text style={styles.sessionId}>SESSION · {activeSession!.session_id.slice(0,8).toUpperCase()}</Text>
          <TouchableOpacity style={styles.giveUpBtn} onPress={handleGiveUp} activeOpacity={0.8}>
            <Text style={styles.giveUpTxt}>Give Up</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Done */}
      {isDone && (
        <View style={styles.center}>
          <TimerRing progress={ringProgress} size={200} color={ringColor}>
            <Text style={{ fontSize: 48 }}>{activeSession!.status === 'success' ? '✅' : '❌'}</Text>
          </TimerRing>
          <Text style={styles.doneTitle}>{activeSession!.status === 'success' ? 'Session Complete!' : 'Session Failed'}</Text>
          {activeSession!.fail_reason && (
            <Text style={styles.doneReason}>Reason: {activeSession!.fail_reason.replace('_', ' ')}</Text>
          )}
          <View style={[styles.rewardPill, { backgroundColor: activeSession!.reward_granted ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.12)' }]}>
            <Text style={[styles.rewardTxt, { color: activeSession!.reward_granted ? C.gold : C.muted }]}>
              {activeSession!.reward_granted ? '💰 +50 coins earned' : isSyncing ? '⟳ Syncing…' : '⏳ Pending sync'}
            </Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={clearSession} activeOpacity={0.8}>
            <Text style={styles.newBtnTxt}>New Session</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Setup */}
      {!activeSession && (
        <View style={styles.setup}>
          <Text style={styles.setupTitle}>Choose Duration</Text>
          <Text style={styles.setupSub}>Complete sessions to earn coins and grow your streak 🔥</Text>
          <View style={styles.grid}>
            {DURATIONS.map(d => (
              <TouchableOpacity key={d} style={styles.durBtn} onPress={() => startSession(d)} activeOpacity={0.75}>
                <Text style={styles.durNum}>{d}</Text>
                <Text style={styles.durUnit}>min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* History */}
      {sessions.length > 0 && (
        <TouchableOpacity style={styles.histToggle} onPress={() => setShowHistory(h => !h)}>
          <Text style={styles.histToggleTxt}>{showHistory ? '▲' : '▼'} History ({sessions.length})</Text>
        </TouchableOpacity>
      )}
      {showHistory && sessions.slice(0, 8).map(s => (
        <View key={s.session_id} style={styles.histItem}>
          <Text style={styles.hiIcon}>{s.status === 'success' ? '✅' : '❌'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.hiTitle}>{s.target_minutes}m · {s.device_id}</Text>
            {s.fail_reason && <Text style={styles.hiSub}>{s.fail_reason.replace('_', ' ')}</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {s.reward_granted && <Text>💰</Text>}
            {s.notified && <Text>📢</Text>}
          </View>
        </View>
      ))}

      {/* Sync button */}
      <TouchableOpacity style={styles.syncBtn} onPress={manualSync} disabled={isSyncing} activeOpacity={0.8}>
        <Text style={styles.syncTxt}>
          {isSyncing ? '⟳ Syncing…' : `⇅ Force Sync${lastSyncTime ? ' · ' + new Date(lastSyncTime).toLocaleTimeString() : ''}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 7 },
  pillTxt: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginBottom: 28 },
  center: { alignItems: 'center', marginBottom: 28 },
  graceBanner: { backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 20, width: '100%' },
  graceText: { color: '#f43f5e', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  resumeBanner: { backgroundColor: 'rgba(45,212,191,0.12)', borderWidth: 1, borderColor: 'rgba(45,212,191,0.3)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 16, width: '100%' },
  resumeText: { color: '#2dd4bf', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  timerBig: { fontSize: 56, fontWeight: '700', color: '#f5f6fb', letterSpacing: -2, fontFamily: FONT_DISPLAY },
  timerSub: { fontSize: 12, color: '#6b7390', marginTop: 2, textAlign: 'center', letterSpacing: 0.5 },
  sessionId: { fontSize: 10, color: '#475569', marginTop: 14, letterSpacing: 1.5 },
  giveUpBtn: { marginTop: 22, backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 12 },
  giveUpTxt: { color: '#f43f5e', fontSize: 15, fontWeight: '700' },
  doneTitle: { fontSize: 24, fontWeight: '700', color: '#f5f6fb', marginTop: 18, fontFamily: FONT_DISPLAY, letterSpacing: -0.5 },
  doneReason: { fontSize: 13, color: '#64748b', marginTop: 4, textTransform: 'capitalize' },
  rewardPill: { marginTop: 12, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 18 },
  rewardTxt: { fontSize: 13, fontWeight: '600' },
  newBtn: { marginTop: 20, backgroundColor: '#7c3aed', paddingVertical: 13, paddingHorizontal: 44, borderRadius: 12, ...webShadow('rgba(124,58,237,0.5)', 36) },
  newBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  setup: { marginBottom: 28 },
  setupTitle: { fontSize: 24, fontWeight: '700', color: '#f5f6fb', textAlign: 'center', marginBottom: 6, fontFamily: FONT_DISPLAY, letterSpacing: -0.5 },
  setupSub: { fontSize: 13, color: '#6b7390', textAlign: 'center', marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  durBtn: { width: '23%', aspectRatio: 1, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.22)', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10, ...webBlur(8) },
  durNum: { fontSize: 22, fontWeight: '700', color: '#8b5cf6', fontFamily: FONT_DISPLAY },
  durUnit: { fontSize: 10, color: '#6b7390', fontWeight: '600', letterSpacing: 0.5 },
  histToggle: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingVertical: 14, alignItems: 'center' },
  histToggleTxt: { fontSize: 12, color: '#475569', fontWeight: '600' },
  histItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  hiIcon: { fontSize: 16, marginRight: 10 },
  hiTitle: { fontSize: 13, color: '#cbd5e1', fontWeight: '600' },
  hiSub: { fontSize: 11, color: '#475569', marginTop: 2, textTransform: 'capitalize' },
  syncBtn: { marginTop: 24, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)', borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.07)' },
  syncTxt: { fontSize: 13, color: '#8b5cf6', fontWeight: '600' },
});
