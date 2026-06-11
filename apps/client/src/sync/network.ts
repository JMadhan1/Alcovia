/**
 * Per-device network gate — the single source of truth for "is this device online".
 *
 * Why this exists: the app auto-syncs on a timer, and the Dev Panel lets you
 * toggle a device offline. If those used different flags, the background
 * auto-sync would silently defeat the offline toggle and the two-device
 * divergence demo wouldn't hold. So EVERY network path (auto-sync, manual sync,
 * dev-panel reconnect) goes through this gate, and SyncEngine.sync() refuses to
 * touch the network when the gate is closed.
 *
 * Backed by localStorage + the `storage` event so a toggle in one tab is also
 * reflected in the other tab viewing the same device.
 */

const KEY = (deviceId: string) => `alcovia:online:${deviceId}`;
const listeners = new Set<() => void>();

export function isOnline(deviceId: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(KEY(deviceId)) !== '0';
}

export function setOnline(deviceId: string, online: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY(deviceId), online ? '1' : '0');
  }
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  listeners.forEach((l) => l());
}

// Cross-tab: another tab toggling the same device updates us too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('alcovia:online:')) notify();
  });
}
