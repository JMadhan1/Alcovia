import { Router, Request, Response } from 'express';
import { AppDB } from '../db/database';

/**
 * Routes for the n8n integration, the notification mock sink, and dev tooling.
 * Mounted at the app root so paths read as /webhook/*, /n8n/*, /dev/*.
 */
export function createWebhookRouter(db: AppDB): Router {
  const router = Router();

  // --- Mock notification sink: n8n's "send" step POSTs here ---
  router.post('/webhook/notify', (req: Request, res: Response) => {
    const { session_id, message, streak_days, coins_earned } = req.body || {};
    console.log('[webhook/notify]', { session_id, message, streak_days, coins_earned });
    res.json({ received: true, message });
  });

  // --- Dev Panel reads this to render the exactly-once proof (SENT + BLOCKED) ---
  router.get('/webhook/notify-log', (_req: Request, res: Response) => {
    res.json(db.getNotifyLog());
  });

  // --- Durable n8n dedup (replaces n8n static data, which is lost on restart) ---
  // n8n calls these so the exactly-once guarantee survives an n8n restart.
  router.get('/n8n/check-dedup', (req: Request, res: Response) => {
    const sessionId = String(req.query.session_id || '');
    res.json({ already_sent: sessionId ? db.isN8nSent(sessionId) : false });
  });

  router.post('/n8n/mark-sent', (req: Request, res: Response) => {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    db.markN8nSent(session_id);
    res.json({ ok: true });
  });

  // --- Clean-slate reset for demos ---
  router.post('/dev/reset', (_req: Request, res: Response) => {
    db.reset();
    console.log('[dev] full reset');
    res.json({ reset: true, timestamp: Date.now() });
  });

  return router;
}
