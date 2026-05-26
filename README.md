# SageLab

Research lab web gateway. Partners submit research questions via chat; the lab runs structured AI workflows with HITL scope approval and commits results to git.

## Quick start

```bash
cp .env.example .env       # 1. configure env (SAGELAB_TOKEN at minimum)
npm install                # 2. install deps
npm run dev                # 3. start server (Next.js + WebSocket on :3000)
```

Open `http://localhost:3000`. Type a research question and click **Run**.

The mock runtime simulates a full research run with all 8 event types. The HITL approval gate pauses at scope review — click "Launch sweep" to continue.

## Environment variables

See `.env.example` for all options with descriptions.

Required for auth: `SAGELAB_TOKEN`

## Architecture

```
Browser (Next.js)
  └── ResearchChat  ←→  WebSocket  ←→  server.ts
                                           └── simulateMockRun  (mock, v0)
                                           └── ClaudeCodeRuntime  (step 5 — SDK spike)
```

The WebSocket is bidirectional: the server sends `ResearchEvent` objects; the browser sends `RUN_REQUEST` and `USER_INPUT_RESPONSE`. All event types are defined in `src/shared/events.ts`.

## Next step: SDK spike

Before continuing to steps 5–8, validate that the Claude Code Agent SDK supports in-process invocation with streaming, and that HITL pause/resume is possible. See `TODOS.md` for the full deferred list.

## Testing

```bash
npm test         # run vitest
npm run test:watch
```
