<div align="center">

# 🎓 Alcovia

### An offline-first study app that **never loses an edit, never double-counts a reward, and never sends a notification twice** — across two devices, on terrible Wi-Fi.

<br/>

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-Expo-000020?logo=expo&logoColor=white)
![Express](https://img.shields.io/badge/Backend-Express-259dff?logo=express&logoColor=white)
![n8n](https://img.shields.io/badge/Automation-n8n-ea4b71?logo=n8n&logoColor=white)
![Sync](https://img.shields.io/badge/Sync-Lamport_clock_(hand--rolled)-8b5cf6)
![Tests](https://img.shields.io/badge/Property_tests-~2%2C300_runs-10b981)

**Two devices diverge offline → reconnect → converge to the identical state. Provably.**

[🎥 Watch the demo on Loom](https://www.loom.com/share/2c0de81a98b8485cace8661b870c9248)

</div>

---

## The problem, in one sentence

> Students study on metros and patchy hostel Wi-Fi, often on a phone *and* a laptop —
> so focus sessions and syllabus progress have to work with **zero network** and
> reconcile to **one correct state** the moment they reconnect.

Wall-clock "last write wins" can't do this — two devices disagree on the time. So this
is a hand-rolled sync engine: an **operation log** ordered by **Lamport logical clocks**,
with idempotency enforced from the app, through the backend, all the way into n8n.

> 📖 **The reasoning lives in [DECISIONS.md](DECISIONS.md)** — sync model, the convergence
> proof, both idempotency layers, the tradeoff I made, and an honest list of where it
> could still break. *(That's the doc worth reading.)*

---

## ⚡ Quick start

```bash
# 1 — Backend  →  http://localhost:3001
cd apps/server && npm install && npm run dev

# 2 — Client   →  http://localhost:8081
cd apps/client && npm install --legacy-peer-deps && npx expo start --web
```

Open the client in **two browser tabs** → pick **Device A** in one, **Device B** in the
other. Separate `localStorage` namespaces = two real, independent devices.

<details>
<summary>Optional: wire up n8n (the server logs & dedups notifications without it)</summary>

```bash
npx n8n                       # http://localhost:5678
# Import n8n-workflow.json, activate it, then run the server with:
# N8N_WEBHOOK_URL=http://localhost:5678/webhook/alcovia-focus
```
The workflow dedups over HTTP against the server (`/n8n/check-dedup` + `/n8n/mark-sent`),
so exactly-once **survives an n8n restart** — unlike static-data dedup.

> **Note:** The n8n workflow uses a mock notification sink (a simple HTTP endpoint that logs the payload) rather than a real WhatsApp API. The exactly-once dedup logic is fully implemented end-to-end; swapping in a real provider (Twilio / Meta / AiSensy) is a one-line URL change.
</details>

---

## 🔬 Don't take my word for it — run the proof

```bash
cd apps/server
npm test                  # ~2,300 randomized property-based scenarios (fast-check)
npm run test:idempotency  # same session synced from BOTH devices → +50 once, 1 notification
```

`npm test` asserts the four properties that *make* the system correct:

| Property | What it proves |
|---|---|
| **Order independence** | forward / reversed / shuffled op streams → identical state |
| **Idempotency** | applying every op twice == applying it once |
| **Higher Lamport wins** | deterministic winner regardless of arrival order |
| **Sticky delete** | a tombstone can't be resurrected by a stale edit |

---

## 🎬 Five things to try (all in the **Dev Panel** tab)

| # | Scenario | What you'll see |
|---|---|---|
| 1 | **Offline focus session** | Complete a session offline → coins update locally → reconnect → server grants the reward |
| 2 | **Same session, both devices** | Reward counts **once**; n8n log shows **1 SENT + 1 BLOCKED** 🟢🚫 |
| 3 | **Task conflict** (Done vs In-Progress) | Higher Lamport wins → **both converge on Done** |
| 4 | **Edit vs delete** | Delete with higher Lamport wins → task **gone on both** |
| 5 | **Crash recovery** | Refresh mid-session → it **resumes** with the right time left |

The Dev Panel toggles each device online/offline, shows live per-device state (coins,
streak, Lamport clock, pending ops), and streams the n8n notification log.

---

## 🧠 How it works

```
  Device A (tab)             Express server                Device B (tab)
  ┌──────────────┐           ┌────────────────────┐        ┌──────────────┐
  │ op queue     │── push ──▶│ op log  (+server_seq)│◀─ push ─│ op queue     │
  │ Lamport clk  │◀─ pull ───│ deterministic merge  │── pull ▶│ Lamport clk  │
  │ localStorage │           │ idempotent reward    │        │ localStorage │
  └──────────────┘           └─────────┬──────────┘         └──────────────┘
                                        │ SESSION_SUCCESS (exactly once)
                                        ▼
                                 n8n workflow ──▶ /webhook/notify  (sink)
                                 durable dedup ──▶ /n8n/check-dedup + /n8n/mark-sent
```

**Convergence in one line:** the server gives every operation a total order
(`server_seq`); every device replays that same ordered log through the same deterministic
merge — same input, same function, same output.

**Idempotency, three layers:**
1. `op_id` primary key → a replayed push is a no-op.
2. `reward_granted` flag → coins/streak apply at most once per session.
3. Durable `n8n_sent` store → the notification fires once, even from both devices.

---

## 🗺️ What I'd do next

- Give the **equal-Lamport edit-vs-delete tie** a principled rule (currently resolved by
  server order) — delete-wins, or a per-field version vector.
- Make the notify step **transactional** — `mark-sent` only after a 2xx from the real
  provider, so a failed send can safely retry.
- **Seed the Lamport clock from the server** on first sync, so clearing site data can't
  make a device briefly lose every conflict.

---

## 📁 Layout

```
apps/client          Expo app — focus / syllabus / dev-panel, sync engine, hooks
apps/server          Express + JSON-file DB — sync routes, reward + n8n services
  └─ src/sync        conflict.ts (ordering) · apply.ts (pure reducer)
  └─ src/tests       convergence.test.ts (property-based proof)
  └─ scripts         test-idempotency.ts (end-to-end exactly-once)
n8n-workflow.json    Importable workflow — HTTP-based, restart-durable dedup
DECISIONS.md         ← the design doc: model, proof, idempotency, tradeoffs, failure modes
```

<div align="center">
<br/>
<sub>Built for the Alcovia full-stack take-home · TypeScript · Expo · Express · n8n</sub>
</div>
