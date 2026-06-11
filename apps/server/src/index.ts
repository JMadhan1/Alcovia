import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { initDatabase } from './db/database';
import { createSyncRouter } from './routes/sync';
import { createWebhookRouter } from './routes/webhook';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const db = initDatabase();

// ── WebSocket real-time push ───────────────────────────────────────────────
// Tracks open connections keyed by student_id.  When any device pushes ops
// we broadcast a lightweight `sync_available` signal so every other connected
// client pulls immediately — no 10-second polling lag.
const studentConns = new Map<string, Set<WebSocket>>();

function broadcastSync(studentId: string, fromDevice: string): void {
  const conns = studentConns.get(studentId);
  if (!conns?.size) return;
  const msg = JSON.stringify({ type: 'sync_available', from_device: fromDevice });
  for (const ws of conns) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch {}
    }
  }
}
// ──────────────────────────────────────────────────────────────────────────

app.use('/sync', createSyncRouter(db, broadcastSync));
app.use(createWebhookRouter(db));

app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head><title>Alcovia Server</title><style>
  body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px}
  h1{color:#2563eb} code{background:#f1f5f9;padding:2px 6px;border-radius:4px}
  .ok{color:#16a34a} .endp{margin:8px 0;padding:8px;background:#f8fafc;border-radius:6px}
</style></head>
<body>
<h1>Alcovia Server</h1>
<p class="ok">Status: <strong>Running</strong> (seq: ${db.getSeq()})</p>
<h3>API Endpoints</h3>
<div class="endp"><code>POST /sync/push</code> — Push operations from client</div>
<div class="endp"><code>GET /sync/pull</code> — Pull operations to client</div>
<div class="endp"><code>WS /ws?student_id=&amp;device_id=</code> — Real-time push notifications</div>
<div class="endp"><code>POST /webhook/notify</code> — Mock n8n notification sink</div>
<div class="endp"><code>GET /webhook/notify-log</code> — Notification history</div>
<div class="endp"><code>POST /dev/reset</code> — Reset server state</div>
<div class="endp"><code>GET /health</code> — Health check</div>
</body></html>`);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', seq: db.getSeq(), ws_connections: [...studentConns.values()].reduce((n, s) => n + s.size, 0) });
});

// Upgrade HTTP server to support WebSocket on the same port
const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws, req) => {
  const urlStr = req.url ?? '/ws';
  const url = new URL(urlStr, `http://localhost`);
  const studentId = url.searchParams.get('student_id') || 'student-001';
  const deviceId = url.searchParams.get('device_id') || 'unknown';

  if (!studentConns.has(studentId)) studentConns.set(studentId, new Set());
  studentConns.get(studentId)!.add(ws);

  ws.on('close', () => studentConns.get(studentId)?.delete(ws));
  ws.on('error', () => studentConns.get(studentId)?.delete(ws));

  console.log(`[ws] ${deviceId} connected (student ${studentId}, total: ${studentConns.get(studentId)!.size})`);
});

process.on('SIGINT', () => { db.flush(); process.exit(0); });
process.on('SIGTERM', () => { db.flush(); process.exit(0); });

httpServer.listen(Number(port), () => {
  console.log(`[server] Alcovia backend running on :${port} (HTTP + WebSocket)`);
});
