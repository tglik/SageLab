# SageLab Architecture

> Last updated: 2026-05-26
> Status: v0 design, approved

---

## What SageLab Is

A multi-project research lab web app. Each **project** is a git repo with a `.claude`
agent and skill setup, its own workflow configuration, and its own artifact folders.
SageLab provides:

1. **Embedded research chat** — trigger and monitor research workflows through a
   structured chat interface with human-in-the-loop approval cards.
2. **Artifact/wiki surface** — read, search, and edit research outputs, agent
   definitions, and skill files directly from the browser.

---

## System Layers

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Next.js + assistant-ui)                        │
│  ├── Project switcher                                    │
│  ├── Chat thread (assistant-ui, AG-UI runtime adapter)   │
│  │     └── Custom ResearchEvent cards:                   │
│  │           SCOPE_CREATED · USER_INPUT_REQUIRED         │
│  │           ARTIFACT_CREATED · COMMIT_CREATED           │
│  └── Wiki surface (v1)                                   │
│        └── File tree · Markdown viewer · CodeMirror edit │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket  (AG-UI protocol events)
┌─────────────────────▼───────────────────────────────────┐
│  SageLab Server (Next.js + custom server.js + ws)        │
│  ├── Projects store    {id, name, gitRepoPath, config}   │
│  ├── Research runs     {id, projectId, type, status,     │
│  │                      events[{type, timestamp, …}]}    │
│  ├── Git service       (read/write project repos)        │
│  ├── Artifact indexer  (folder tree, file content)       │
│  └── Runtime registry  {projectId → Runtime instance}   │
└─────────────────────┬───────────────────────────────────┘
                      │ Runtime interface
                      │ executeWorkflow(type, params):
                      │   AsyncIterable<ResearchEvent>
┌─────────────────────▼───────────────────────────────────┐
│  Runtime Layer                                           │
│  └── ClaudeCodeRuntime (v0)                              │
│        └── Claude Code Agent SDK                         │
│              (or: child_process + NDJSON parse fallback) │
└─────────────────────┬───────────────────────────────────┘
                      │ git repo filesystem access
┌─────────────────────▼───────────────────────────────────┐
│  Project Git Repo (any registered repo)                  │
│  ├── .claude/agents/        specialist agent definitions │
│  ├── .claude/skills/        research workflow skill files│
│  └── [project]/             artifacts, research, docs    │
└─────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### Multi-project first

Each project is a separate git repo. SageLab is a platform, not a single-lab tool.
The QML/ai-os lab is instance one.

### Runtime abstraction

```typescript
interface Runtime {
  executeWorkflow(
    type: WorkflowType,
    params: WorkflowParams,
    repoPath: string
  ): AsyncIterable<ResearchEvent>
}
```

v0 implementation: `ClaudeCodeRuntime` (Claude Code Agent SDK).
Adding Codex or future runtimes = new class implementing `Runtime`. Zero changes to
the server or UI.

**SDK spike required before step 5:** Verify the Claude Code Agent SDK supports
in-process invocation with a streaming callback. If it's CLI-only, fall back to
`child_process` + NDJSON parsing. Gate the full chat flow on the spike result.

### WebSocket, not SSE

`USER_INPUT_REQUIRED` needs bidirectional communication: server pauses the run,
waits for the user's approval from the browser, resumes. SSE (server-to-client only)
can't do this cleanly. WebSocket handles it in one connection.

Next.js API routes don't support long-lived WebSocket connections natively. Use a
custom `server.js` with the `ws` package from step 1 — do not defer this.

### Reconnect / run replay

If the WebSocket drops while a run is `waiting_input`, the run stays paused. On
reconnect, the server replays the last `USER_INPUT_REQUIRED` event.

### AG-UI protocol

[assistant-ui](https://www.assistant-ui.com/docs/runtimes/ag-ui/overview) has a
built-in AG-UI runtime adapter. The custom frontend `RuntimeAdapter` opens a WebSocket
and yields AG-UI-compatible message deltas. The `LocalRuntime` (no-backend mock) is
used during frontend development only.

---

## Research Event Schema

```typescript
type BaseEvent = { runId: string; timestamp: string /* ISO-8601 */ }

type ResearchEvent = BaseEvent & (
  | { type: "RUN_STARTED";          workflowType: string }
  | { type: "STATUS";               message: string }
  | { type: "SCOPE_CREATED";        artifactPath: string }
  | { type: "TOOL_CALL_STARTED";    tool: string; description: string }
  | { type: "TOOL_CALL_COMPLETED";  tool: string }
  | { type: "ARTIFACT_CREATED";     path: string; title: string }
  | { type: "USER_INPUT_REQUIRED";  prompt: string; choices: string[];
                                    contextArtifact?: string }
  | { type: "TEXT_DELTA";           delta: string }
  | { type: "RUN_COMPLETED";        artifactPaths: string[] }
  | { type: "RUN_FAILED";           error: string }
  | { type: "COMMIT_CREATED";       commitHash: string; message: string }
)
```

Do not stream raw Claude Code output to the browser. Map agent activity to these
typed events.

---

## Project Data Model

```typescript
interface Project {
  id: string
  name: string
  gitRepoPath: string          // local filesystem path (v0)
                               // Docker volume mount path (v1)
  workflowConfig: {
    availableWorkflows: string[]   // auto-detected from .claude/skills/ folder names
    artifactFolders: string[]      // manually set during project setup
                                   // e.g. ["01_Projects/QML_Startup/artifacts"]
    // .claude/ path is always the convention — not configurable
  }
}

interface ResearchRun {
  id: string
  projectId: string
  type: WorkflowType           // "deep-research" | "review-paper" | …
  status: "pending" | "running" | "waiting_input" | "completed" | "failed"
  events: ResearchEvent[]
  startedAt: Date
  completedAt?: Date
}
```

---

## v0 Build Order

| Step | What | Milestone |
|------|------|-----------|
| 1 | Next.js scaffold + custom `server.js` + `ws` | WebSocket connection works |
| 2 | Project setup UI | Create project, auto-detect workflows, set artifact folders |
| 3 | Chat UI shell + `RuntimeAdapter` (mock) | Thread renders, fake events stream |
| 4 | **SDK spike** | Confirm Agent SDK API shape; choose SDK or CLI fallback |
| 5 | `ClaudeCodeRuntime` | Real `TEXT_DELTA` events stream to browser |
| 6 | Structured research events | `SCOPE_CREATED` card renders in chat |
| 7 | HITL approval cards + reconnect replay | Scope approval pauses/resumes run |
| 8 | Artifact cards + git commit service | Final report linked; changes committed |

---

## v1 Scope (after v0 ships)

- Wiki: file tree, markdown viewer, CodeMirror editor, commit history
- Rich editor: MDXEditor for reports and non-technical content
- Skill/workflow edit proposals with validation
- Hermes integration: Telegram/Slack/WhatsApp notifications
- `RepoResolver` abstraction for Docker volume / clone-on-demand
- Second runtime (Codex or cloud runtime)
- Multi-user auth (OAuth)
- Concurrent run support

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend framework | Next.js 15+, TypeScript, Tailwind |
| Chat UI | [assistant-ui](https://www.assistant-ui.com/) |
| Agent event protocol | AG-UI (assistant-ui built-in adapter) |
| WebSocket | `ws` package + custom `server.js` |
| Runtime | Claude Code Agent SDK (v0) |
| Git operations | `simple-git` or `isomorphic-git` |
| Markdown rendering | react-markdown + Shiki + Mermaid (wiki, v1) |
| Source editor | CodeMirror 6 (wiki, v1) |
| Auth (v0) | Shared Bearer token in `.env` |

---

## Auth (v0)

Single shared-secret Bearer token stored in `.env`. Partners receive it out-of-band.
No OAuth, no user management. Replace in v1.

---

## Full Design Doc

[`~/.gstack/projects/tglik-SageLab/tsahi-main-design-20260526-142219.md`](../../../.gstack/projects/tglik-SageLab/tsahi-main-design-20260526-142219.md)
