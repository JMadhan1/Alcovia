# DECISIONS.md

How sync works, why two devices always converge, how idempotency is enforced
end-to-end (app → backend → n8n), and where it could still break.

---

## The sync model: an operation log, not state snapshots

Every user action becomes an immutable **operation** with a stable, device-generated
`op_id` (UUID): `SESSION_START`, `SESSION_SUCCESS`, `SESSION_FAIL`, `TASK_UPDATE`,
`TASK_DELETE`. Clients never PUT state — they append operations to a local queue and
push that queue when online. The server appends accepted ops to a single log and
assigns each a monotonic `server_seq`.

Why operations and not state diffs:
- **Idempotency is trivial** — `op_id` is the dedup key. A replayed push is a no-op.
- **Ordering is explicit** — `server_seq` gives every device the same replay order.
- **Nothing is silently lost** — an offline edit is a durable row, not an overwrite.

Storage: client = `localStorage`, namespaced per device (`device-A:` / `device-B:`)
so two browser tabs behave as two independent devices. Server = a JSON file
(`alcovia-db.json`) via a tiny `AppDB`. Both are deliberately boring; the interesting
part is the merge, not the storage engine.

---

## Conflict resolution: Lamport clocks

Wall-clock "last write wins" is wrong here — a phone and a laptop disagree on the time,
so the "latest" write is undefined. We use a **Lamport logical clock** per device
(`tick` on local events, `max(local,remote)+1` on receive). It encodes causality
without trusting any wall clock.

**The rule (total order):** higher `lamport_clock` wins; ties broken by higher
`device_id` (lexicographic). This lives in one pure function, `aWins(a, b)` — total,
deterministic, time-independent.

| Conflict | Resolution |
|---|---|
| Same task edited on both devices | Higher Lamport wins; equal → higher device_id |
| Edit on one device, delete on the other | Delete wins if its Lamport ≥ the edit's (sticky tombstone) |
| Same op delivered twice / out of order | `op_id` is the primary key → deduped; replay order doesn't matter for updates |

Worked example: A marks task→Done at Lamport 7, B marks the same task→In-Progress at
Lamport 3. Both devices pull the same two ops and both run `aWins`: 7 > 3, A wins.
Both converge on **Done**, regardless of who synced first.

---

## Why two devices always end up identical

Two independent guarantees compose:

1. **A single total order.** The server stamps every operation with `server_seq`. Every
   device pulls ops `since_seq` and applies them in `server_seq` order — the *same*
   ordered log on every device.
2. **A deterministic, replay-order-independent reducer.** `applyOperations` (in
   `apps/server/src/sync/apply.ts`) decides winners purely via `aWins`. For concurrent
   `TASK_UPDATE`s the winner is the max under a total order, which is commutative and
   associative — so the result doesn't depend on the order ops are folded in.

Same ordered input + same deterministic function = same output. That's convergence.

**This is proven, not asserted.** `apps/server/src/tests/convergence.test.ts` runs
~2,300 randomized cases with `fast-check`:
- *Order independence* — forward, reversed, and shuffled op sequences yield identical state.
- *Idempotency* — applying every op twice equals applying it once.
- *Higher Lamport always wins* — regardless of argument order.
- *Sticky delete* — a delete with the highest clock can't be resurrected by stale edits.

Run with `cd apps/server && npm test`.

---

## Idempotency: backend

Two layers guard the reward:

1. **`op_id` primary key.** `insertOperation` ignores an `op_id` it already has, so a
   retried or duplicated push never re-enters the pipeline.
2. **`reward_granted` flag, checked in `grantReward`.** Coins/streak are applied only if
   the session's flag is 0, then the flag is set. A second `SESSION_SUCCESS` for the
   same `session_id` — including the same session synced from *both* devices — finds the
   flag already set and does nothing.

Because the server is single-threaded Node over an in-memory object (flushed to JSON),
`nextSeq()` + insert run synchronously with no `await` between them — there is no
interleaving window, so seq assignment needs no lock. (If this moved to Postgres with
real concurrency, the grant would need a transaction or a unique constraint;
that's noted under "Where it could break.")

End-to-end proof: `npm run test:idempotency` resets the server, syncs the *same*
session from device-A and device-B, and asserts coins == 50 (not 100) and exactly one
notification SENT.

---

## Idempotency: n8n

The notification must fire exactly once per session even across replays and dual-device
syncs. **Static workflow data is not durable** — n8n Cloud's free tier loses it on
workflow restart — so we don't rely on it. The durable dedup store is the server's
`n8n_sent` table, exposed to the workflow over HTTP:

```
Webhook → GET /n8n/check-dedup?session_id=…
        → IF already_sent → respond "duplicate_skipped"
        → ELSE  → POST /webhook/notify (send) → POST /n8n/mark-sent → respond "sent"
```

The server *also* dedups before it ever calls n8n (`fireN8nWebhook` checks
`isN8nSent`), and records every attempt — `SENT` or `BLOCKED` — in a notification log
the Dev Panel renders. So a dual-device sync visibly shows **1 SENT + 1 BLOCKED**.
Belt and suspenders: even if n8n is triggered from elsewhere, its own HTTP dedup holds.

---

## Tradeoff I made: Lamport over vector clocks

Lamport clocks give a total order but **cannot detect** that two edits were truly
concurrent — they just pick a deterministic winner. Vector clocks would detect
concurrency and let me surface "these genuinely conflict, you choose." I chose Lamport
because for grade 6–12 study tasks the cost of occasionally auto-picking the wrong
concurrent status edit is low, and the implementation is dramatically simpler and easier
to reason about. **Where this is wrong:** collaborative, high-stakes, or
simultaneously-edited data — there I'd want vector clocks plus a user-facing merge UI.

---

## Where it could still break (honest list)

1. **Equal-Lamport edit-vs-delete is the one non-commutative corner.** If an edit and a
   delete carry the *same* clock, fold order matters in the pure reducer. In the real
   system this is masked because every device replays the *server-ordered* log, so all
   devices still agree — but the outcome depends on server arrival order, not on a
   principled rule. Fix: make delete unconditionally win on ties, or carry a per-field
   version vector.
2. **n8n dedup is now server-backed, but the mock sink isn't transactional.** If
   `/webhook/notify` (the "send WhatsApp" step) fails *after* `mark-sent`, we'd record
   a send that didn't deliver. Fix: mark-sent only after a 2xx from the provider, and
   make the provider call idempotent on `session_id`.
3. **Lamport clock lives in `localStorage`.** Clearing site data resets it to 0, so that
   device's next ops would lose every conflict until it catches up via `receive()` on
   the next pull. Fix: seed the clock from the server's max-seen clock on first sync.
4. **Single-writer server.** The JSON-file store is fine for a demo and single student,
   not for concurrent writers. Real deployment → Postgres, with the reward grant behind
   a transaction + unique constraint as noted above.

---

## Crash recovery (app restart mid-session)

A running focus session writes a `session_checkpoint` to `localStorage` immediately and
every 10s (`{session_id, started_at, elapsed_seconds, checkpoint_at}`). On load the hook
reconstructs elapsed time as `elapsed_seconds + (now − checkpoint_at)`:
- **remaining > 0** → resume the timer with the correct remaining time ("Session resumed" banner).
- **remaining ≤ 0** → the timer would have ended while the app was closed; since the
  student wasn't in the session, it auto-fails with reason `app_switch` (no reward).

The checkpoint is cleared on any session end, so a stale one never resurrects a finished
session.

---

## A note on the offline toggle

The Dev Panel's offline switch is enforced at the **sync engine**, not by monkey-patching
`window.fetch`. A single per-device gate (`src/sync/network.ts`, backed by `localStorage`
+ the `storage` event so it works across tabs) is read by `SyncEngine.sync()`, which
refuses all network I/O while the device is offline. This is deliberately *not* a global
fetch override: in a shared browser context that would risk blocking the online device's
own traffic and the panel's own polling. One gate, checked at the one place that talks to
the network.
