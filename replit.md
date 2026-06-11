# Alcovia — Offline-First Study App

A full-stack offline-first study app built with TypeScript, React Native (Expo web), and Express.

## Architecture

- **`apps/client`** — Expo web app (React Native for Web), runs on port 5000
- **`apps/server`** — Express backend, runs on port 3001

## Running

Two workflows run automatically:
- **Start application** — Expo web client on port 5000
- **Start Backend** — Express API server on port 3001

## Key Features

- **Focus Sessions** — timer with streak/coin rewards, offline-first
- **Syllabus** — task status tracking with per-chapter/subject progress rollup
- **Dev Panel** — toggle online/offline per device, trigger conflict scenarios, view n8n notification log
- **Sync** — Lamport-clock CRDTs, idempotent rewards, exactly-once n8n notifications

## User Preferences

- Keep the UI simple and functional — this isn't a design task
- TypeScript strict mode throughout
- No login — hardcoded `student-001` as the shared student ID
