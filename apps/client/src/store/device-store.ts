import React from 'react';
import { ClientDB } from '../db/client-db';
import { LamportClock } from '../sync/lamport';
import { OperationQueue } from '../sync/op-queue';
import { SyncEngine } from '../sync/sync-engine';

export interface DeviceStore {
  deviceId: string;
  db: ClientDB;
  clock: LamportClock;
  queue: OperationQueue;
  syncEngine: SyncEngine;
}

export const DeviceContext = React.createContext<DeviceStore | null>(null);

export function createDeviceStore(deviceId: string, serverUrl: string): DeviceStore {
  const db = new ClientDB(deviceId);
  const clock = new LamportClock(deviceId);
  const queue = new OperationQueue(db, clock, deviceId);
  const syncEngine = new SyncEngine(db, queue, clock, deviceId, serverUrl);

  db.initializeSubjectsIfEmpty();

  return {
    deviceId,
    db,
    clock,
    queue,
    syncEngine,
  };
}
