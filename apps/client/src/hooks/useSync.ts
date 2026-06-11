import { useEffect, useState, useCallback, useRef } from 'react';
import { SyncEngine } from '../sync/sync-engine';
import { isOnline as gateIsOnline, subscribe } from '../sync/network';

interface Return {
  isSyncing: boolean; lastSyncTime: number | null;
  syncError: string | null; manualSync: () => Promise<void>; isOnline: boolean;
}

function toWsUrl(httpUrl: string, deviceId: string): string {
  const base = httpUrl.replace(/^http/, 'ws');
  return `${base}/ws?student_id=student-001&device_id=${encodeURIComponent(deviceId)}`;
}

export function useSync(syncEngine: SyncEngine, serverUrl: string): Return {
  const deviceId = syncEngine.deviceId;
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => gateIsOnline(deviceId));
  const syncingRef = useRef(false);
  const backoffRef = useRef(1000);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const update = () => setIsOnline(gateIsOnline(deviceId));
    update();
    return subscribe(update);
  }, [deviceId]);

  const manualSync = useCallback(async () => {
    if (syncingRef.current || !gateIsOnline(deviceId)) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncEngine.sync();
      setLastSyncTime(Date.now());
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [syncEngine, deviceId]);

  useEffect(() => {
    if (isOnline) manualSync();
  }, [isOnline, manualSync]);

  // Auto-sync every 10s (fallback for when WebSocket is not connected)
  useEffect(() => {
    if (!isOnline) return;
    const t = setInterval(() => { manualSync(); }, 10000);
    return () => clearInterval(t);
  }, [isOnline, manualSync]);

  // WebSocket real-time push: server broadcasts sync_available when another
  // device pushes ops — we react instantly instead of waiting for the next poll.
  useEffect(() => {
    const wsUrl = toWsUrl(serverUrl, deviceId);

    function connect() {
      if (!gateIsOnline(deviceId)) {
        // Don't try WebSocket while the dev-panel has us offline.
        reconnectRef.current = setTimeout(connect, 3000);
        return;
      }
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          backoffRef.current = 1000; // reset backoff on successful connect
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            // Only react to events from OTHER devices
            if (msg.type === 'sync_available' && msg.from_device !== deviceId) {
              manualSync();
            }
          } catch {}
        };

        ws.onerror = () => {};

        ws.onclose = () => {
          wsRef.current = null;
          // Exponential backoff with jitter, cap at 30s
          const jitter = Math.random() * 500;
          reconnectRef.current = setTimeout(connect, backoffRef.current + jitter);
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
        };
      } catch {
        reconnectRef.current = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, 30000);
      }
    }

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [serverUrl, deviceId, manualSync]);

  return { isSyncing, lastSyncTime, syncError, manualSync, isOnline };
}
