// Custom server: Next.js + WebSocket on the same port.
// Entry point for both `npm run dev` and `npm start`.
// Run with: tsx server.ts

import { createServer } from "http";
import type { IncomingMessage } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { ResearchEvent } from "@/shared/events";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.SAGELAB_HOST || "localhost"; // DX3: renamed from HOSTNAME (avoids shell builtin collision)
const port = parseInt(process.env.PORT || "3000", 10);
const authToken = process.env.SAGELAB_TOKEN; // D1: undefined = no auth required
const wsPath = process.env.SAGELAB_WS_PATH || "/ws"; // DX9: override for reverse proxies
const useMock = process.env.SAGELAB_MOCK !== "false"; // DX4: default true until SDK spike

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => { // DX6: catch below
    const httpServer = createServer((req, res) => {
      handle(req, res, parse(req.url!, true));
    });

    const wss = new WebSocketServer({ server: httpServer, path: wsPath });

    // Run lock: reject concurrent runs from multiple tabs
    let currentRunId: string | null = null;
    // Event buffer: replay USER_INPUT_REQUIRED to reconnecting clients
    let runEvents: ResearchEvent[] = [];
    // HITL resolver: called when USER_INPUT_RESPONSE arrives
    let hitlResolver: ((choice: string) => void) | null = null;

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      // D1: Validate bearer token on WS upgrade
      if (authToken) {
        const params = new URL(req.url!, `http://${req.headers.host}`).searchParams;
        if (params.get("token") !== authToken) {
          ws.close(4001, "Unauthorized");
          return;
        }
      }

      console.log("[ws] client connected");

      // Replay buffered events (USER_INPUT_REQUIRED) to reconnecting client
      for (const event of runEvents) {
        ws.send(JSON.stringify(event));
      }

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          handleWsMessage(ws, msg);
        } catch (err) {
          console.error("[ws] bad message:", err);
        }
      });

      ws.on("close", () => console.log("[ws] client disconnected"));
    });

    function handleWsMessage(ws: WebSocket, msg: Record<string, unknown>) {
      if (msg.type === "RUN_REQUEST") {
        // Run lock: reject if run already in progress
        if (currentRunId !== null) {
          const rejection: ResearchEvent = {
            type: "RUN_FAILED",
            runId: (msg.runId as string) || "unknown",
            error: "Run in progress",
            code: "RUN_LOCK",
            timestamp: new Date().toISOString(),
          };
          ws.send(JSON.stringify(rejection));
          return;
        }

        const runId = `run_${Date.now()}`;
        currentRunId = runId;
        runEvents = [];

        const query = (msg.query as string) || "";
        const runner = useMock ? simulateMockRun : rejectNoRuntime;
        runner(ws, runId, query).finally(() => {
          currentRunId = null;
        });
      } else if (msg.type === "USER_INPUT_RESPONSE") {
        // E5: Validate runId to prevent stale responses from racing connections
        if (msg.runId !== currentRunId) {
          console.warn("[ws] USER_INPUT_RESPONSE for unknown runId:", msg.runId);
          return;
        }
        if (hitlResolver) {
          hitlResolver(msg.choice as string);
          hitlResolver = null;
        }
      }
    }

    function emit(ws: WebSocket, event: ResearchEvent) {
      if (event.type === "USER_INPUT_REQUIRED") {
        runEvents = [event]; // Buffer latest USER_INPUT_REQUIRED for reconnect replay
      }
      if (event.type === "RUN_COMPLETED" || event.type === "RUN_FAILED") {
        runEvents = []; // Clear buffer when run ends
      }
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }

    async function simulateMockRun(ws: WebSocket, runId: string, query: string) {
      // DX7: catch errors and emit RUN_FAILED so the client doesn't hang
      try {
        const send = (event: ResearchEvent) => emit(ws, event);

        send({
          type: "RUN_STARTED",
          runId,
          workflowType: "deep-research",
          timestamp: ts(),
        });

        await delay(400);
        send({ type: "STATUS", runId, message: "[mock] Creating research scope…", timestamp: ts() }); // DX5: [mock] prefix

        await delay(800);
        send({ type: "SCOPE_CREATED", runId, artifactPath: "research/mock/scope.md", timestamp: ts() });

        await delay(600);
        send({
          type: "USER_INPUT_REQUIRED",
          runId,
          prompt: `Scope created for: "${query}". Proceed with literature sweep?`,
          choices: ["Launch sweep", "Revise scope"],
          contextArtifact: "research/mock/scope.md",
          timestamp: ts(),
        });

        // Real HITL gate: wait for USER_INPUT_RESPONSE (auto-approve after 60s for mock)
        const choice = await new Promise<string>((resolve) => {
          hitlResolver = resolve;
          const timeout = setTimeout(() => {
            if (hitlResolver === resolve) {
              hitlResolver = null;
              resolve("Launch sweep");
            }
          }, 60_000);
          // Allow the resolver to cancel the timeout when called normally
          const originalResolve = resolve;
          hitlResolver = (c: string) => {
            clearTimeout(timeout);
            originalResolve(c);
          };
        });

        send({ type: "STATUS", runId, message: `[mock] ${choice} — Literature sweep running…`, timestamp: ts() });
        await delay(1000);

        send({ type: "TOOL_CALL_STARTED", runId, tool: "literature-scout", description: "Searching papers…", timestamp: ts() });
        await delay(1200);
        send({ type: "TOOL_CALL_COMPLETED", runId, tool: "literature-scout", timestamp: ts() });

        await delay(500);
        send({ type: "ARTIFACT_CREATED", runId, path: "research/mock/report.md", title: "Mock Research Report", timestamp: ts() });

        await delay(300);
        send({ type: "COMMIT_CREATED", runId, commitHash: "abc1234", message: "feat(research): add mock research report", timestamp: ts() });

        await delay(200);
        send({ type: "RUN_COMPLETED", runId, artifactPaths: ["research/mock/report.md"], timestamp: ts() });
      } catch (err) {
        console.error("[server] simulateMockRun error:", err);
        emit(ws, {
          type: "RUN_FAILED",
          runId,
          error: err instanceof Error ? err.message : String(err),
          code: "INTERNAL_ERROR",
          timestamp: ts(),
        });
      }
    }

    async function rejectNoRuntime(ws: WebSocket, runId: string, _query: string) {
      emit(ws, {
        type: "RUN_FAILED",
        runId,
        error: "Real runtime not yet implemented. Set SAGELAB_MOCK=true or complete the SDK spike.",
        code: "NO_RUNTIME",
        timestamp: ts(),
      });
    }

    httpServer.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> WebSocket on ws://${hostname}:${port}${wsPath}`);
      if (!authToken) console.warn("> SAGELAB_TOKEN not set — unauthenticated access allowed");
      if (useMock) console.log("> Mock runtime active (SAGELAB_MOCK=true)");
    });
  })
  .catch((err: Error) => { // DX6: handle prepare() failure
    console.error("Failed to start server:", err);
    process.exit(1);
  });

const ts = () => new Date().toISOString();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
