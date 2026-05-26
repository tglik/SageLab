# Repository Guidelines

## Project Structure & Module Organization

SageLab is a Next.js 15 + TypeScript research gateway with a custom WebSocket server.

- `server.ts` starts the Next app and `ws` server on `:3000`.
- `src/app/` contains App Router pages, layout, and global styles.
- `src/components/` contains React UI components such as `ResearchChat` and connection status.
- `src/runtime/` contains browser runtime logic and tests, especially `wsRuntime.ts`.
- `src/shared/events.ts` is the single source of truth for `ResearchEvent` types shared by server and client.
- `ARCHITECTURE.md`, `README.md`, and `TODOS.md` hold design context and future work.

## Build, Test, and Development Commands

- `npm install` installs dependencies. Keep `package-lock.json` current when using npm.
- `npm run dev` runs the TypeScript custom server with Next.js and WebSocket support.
- `npm run build` builds the production Next.js app.
- `npm start` runs the production server with `NODE_ENV=production`.
- `npm run type-check` runs `tsc --noEmit`.
- `npm test` runs the Vitest suite once.
- `npm run test:watch` runs Vitest in watch mode.

Create `.env` from `.env.example`; `SAGELAB_TOKEN` is required for auth.

## Coding Style & Naming Conventions

Use TypeScript with `strict` mode. Prefer named exports for shared utilities and keep browser/server contracts typed through `src/shared/events.ts`. Use the `@/*` path alias for imports from `src`.

Follow the existing style: two-space indentation, double quotes, semicolons, PascalCase React components, camelCase variables/functions, and `*.test.ts` for tests. Keep comments brief and focused on non-obvious behavior, especially WebSocket and HITL edge cases.

## Testing Guidelines

Tests use Vitest with browser behavior mocked where needed. Place tests next to the code they cover, as in `src/runtime/wsRuntime.test.ts`. Cover event parsing, WebSocket reconnect behavior, queued messages, and HITL pause/resume flows when changing runtime logic.

Run `npm test` and `npm run type-check` before opening a PR.

## Commit & Pull Request Guidelines

Recent commits are short, imperative, and sometimes scoped, for example `fix(hitl): ...`, `feat(v0): ...`, or `clean build ts`. Use a concise subject that names the affected area when helpful.

PRs should include a short description, test results, linked issue or task when available, and screenshots for visible UI changes. Call out changes to event schemas, auth behavior, environment variables, or WebSocket protocol assumptions.

## Agent-Specific Notes

Do not stream raw agent output directly to the browser. Map runtime activity into typed `ResearchEvent` objects and keep `src/shared/events.ts` synchronized across client, server, and tests.
