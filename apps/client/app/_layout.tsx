import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Animated, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { DeviceContext, createDeviceStore } from '../src/store/device-store';
import { T, ACCENTS, FONT_DISPLAY, injectWebStyles, webShadow, webBlur } from '../src/theme';

import { SERVER_URL } from '../src/config';

// Transparent navigation theme so our full-page aurora gradient shows through
// the tab scenes instead of React Navigation's default opaque background.
const NAV_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent', card: 'transparent', border: T.border },
};

function DeviceOption({
  id, name, role, accent, delay, onPress,
}: { id: string; name: string; role: string; accent: { solid: string; soft: string; glow: string }; delay: number; onPress: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const [hover, setHover] = useState(false);
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 500, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }], width: '100%' }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        // @ts-ignore web hover
        onMouseEnter={() => setHover(true)}
        // @ts-ignore
        onMouseLeave={() => setHover(false)}
        style={[
          styles.deviceCard,
          { borderColor: hover ? accent.solid : T.border, backgroundColor: hover ? accent.soft : T.glass },
          hover ? webShadow(accent.glow, 50) : {},
          webBlur(12),
        ]}
      >
        <View style={[styles.deviceGlyph, { backgroundColor: accent.soft, borderColor: accent.solid }]}>
          <View style={[styles.deviceDot, { backgroundColor: accent.solid }, webShadow(accent.glow, 16)]} />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{name}</Text>
          <Text style={styles.deviceHint}>{role}</Text>
        </View>
        <Text style={[styles.deviceArrow, { color: hover ? accent.solid : T.muted }]}>→</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function RootLayout() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;

  const deviceStores = useMemo(() => ({
    'device-A': createDeviceStore('device-A', SERVER_URL),
    'device-B': createDeviceStore('device-B', SERVER_URL),
  }), []);

  useEffect(() => { injectWebStyles(ACCENTS['device-A'].glow); }, []);

  useEffect(() => {
    if (selectedDevice) injectWebStyles(ACCENTS[selectedDevice]?.glow);
    else injectWebStyles(ACCENTS['device-A'].glow);
  }, [selectedDevice]);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(logoFloat, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (!selectedDevice || !deviceStores[selectedDevice as keyof typeof deviceStores]) {
    return (
      <SafeAreaView style={styles.container}>
        <Animated.View style={[styles.selector, { opacity: fade }]}>
          <View style={styles.brandWrap}>
            <Animated.View
              style={[
                styles.logoRing,
                webShadow(ACCENTS['device-A'].glow, 60),
                { transform: [{ translateY: logoFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] },
              ]}
            >
              <Text style={styles.logoMark}>◉</Text>
            </Animated.View>
            <Text style={styles.brand}>Alcovia</Text>
            <View style={styles.tagRow}>
              <View style={styles.tagDot} />
              <Text style={styles.tag}>OFFLINE-FIRST · CONFLICT-FREE SYNC</Text>
            </View>
          </View>

          <Text style={styles.pickLabel}>OPEN A DEVICE</Text>

          <DeviceOption
            id="device-A" name="Device A" role="Phone · primary"
            accent={ACCENTS['device-A']} delay={120}
            onPress={() => setSelectedDevice('device-A')}
          />
          <DeviceOption
            id="device-B" name="Device B" role="Laptop · secondary"
            accent={ACCENTS['device-B']} delay={220}
            onPress={() => setSelectedDevice('device-B')}
          />

          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>Two-device demo</Text>
            <Text style={styles.hint}>
              Open this URL in two tabs and pick a different device in each. They keep fully separate
              storage — take them offline, make conflicting edits, then reconnect and watch them converge.
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  const currentStore = deviceStores[selectedDevice as keyof typeof deviceStores];
  const accent = ACCENTS[selectedDevice];

  return (
    <DeviceContext.Provider value={currentStore}>
      <ThemeProvider value={NAV_THEME}>
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, webBlur(16), { borderBottomColor: T.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerBadge, { borderColor: accent.solid, backgroundColor: accent.soft }]}>
              <View style={[styles.headerDot, { backgroundColor: accent.solid }, webShadow(accent.glow, 12)]} />
              <Text style={[styles.headerTitle, { color: accent.solid }]}>{selectedDevice === 'device-A' ? 'Device A' : 'Device B'}</Text>
            </View>
            <Text style={styles.headerSub}>student-001</Text>
          </View>
          <TouchableOpacity style={styles.switchBtn} onPress={() => setSelectedDevice(null)} activeOpacity={0.8}>
            <Text style={styles.switchText}>⇄  Switch</Text>
          </TouchableOpacity>
        </View>

        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: [styles.tabBar, webBlur(18)],
            tabBarActiveTintColor: accent.solid,
            tabBarInactiveTintColor: T.muted,
            tabBarLabelStyle: styles.tabLabel,
            sceneStyle: { backgroundColor: T.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ href: null }} />
          <Tabs.Screen name="focus/index" options={{ title: 'Focus', tabBarLabel: 'Focus' }} />
          <Tabs.Screen name="syllabus/index" options={{ title: 'Syllabus', tabBarLabel: 'Syllabus' }} />
          <Tabs.Screen name="devpanel/index" options={{ title: 'Dev', tabBarLabel: 'Dev Panel' }} />
        </Tabs>
      </SafeAreaView>
      </ThemeProvider>
    </DeviceContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : T.bg },
  selector: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, maxWidth: 460, width: '100%', alignSelf: 'center' },

  brandWrap: { alignItems: 'center', marginBottom: 44 },
  logoRing: {
    width: 86, height: 86, borderRadius: 26, backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.5)', justifyContent: 'center', alignItems: 'center', marginBottom: 22,
  },
  logoMark: { fontSize: 38, color: T.violet },
  brand: { fontSize: 44, fontWeight: '700', color: T.text, letterSpacing: -1.5, fontFamily: FONT_DISPLAY },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 7 },
  tagDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.teal },
  tag: { fontSize: 10.5, color: T.textDim, letterSpacing: 2, fontWeight: '600' },

  pickLabel: { fontSize: 11, letterSpacing: 3, color: T.muted, marginBottom: 16, alignSelf: 'flex-start', fontWeight: '600' },

  deviceCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12,
    // @ts-ignore web transition
    transition: 'all 0.2s ease',
  },
  deviceGlyph: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  deviceDot: { width: 12, height: 12, borderRadius: 6 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 17, fontWeight: '700', color: T.text, fontFamily: FONT_DISPLAY },
  deviceHint: { fontSize: 12.5, color: T.muted, marginTop: 3 },
  deviceArrow: { fontSize: 20, fontWeight: '700' },

  hintCard: { marginTop: 28, borderRadius: 16, borderWidth: 1, borderColor: T.border, backgroundColor: T.glass, padding: 16, width: '100%' },
  hintTitle: { fontSize: 12, fontWeight: '700', color: T.textDim, marginBottom: 6, letterSpacing: 0.5 },
  hint: { fontSize: 12.5, color: T.muted, lineHeight: 19 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1,
    backgroundColor: 'rgba(7,7,19,0.55)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, gap: 7 },
  headerDot: { width: 7, height: 7, borderRadius: 4 },
  headerTitle: { fontSize: 13, fontWeight: '700', fontFamily: FONT_DISPLAY },
  headerSub: { fontSize: 11.5, color: T.faint, fontWeight: '500', letterSpacing: 0.5 },
  switchBtn: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 10, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  switchText: { fontSize: 12.5, fontWeight: '600', color: T.textDim },

  tabBar: { backgroundColor: 'rgba(10,10,26,0.7)', borderTopWidth: 1, borderTopColor: T.border, height: 60, paddingBottom: 6, paddingTop: 6 },
  tabLabel: { fontSize: 11.5, fontWeight: '600' },
});
