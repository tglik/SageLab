// Custom server: Next.js + WebSocket on the same port.
// Next.js API routes don't support long-lived WebSocket connections natively.
// This server.js is the entry point for both `npm run dev` and `npm start`.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server shares the HTTP server so both run on port 3000.
  // The frontend connects to ws://localhost:3000/ws
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("[ws] client connected");

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleWsMessage(ws, msg);
      } catch (err) {
        console.error("[ws] bad message:", err);
      }
    });

    ws.on("close", () => {
      console.log("[ws] client disconnected");
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket on ws://${hostname}:${port}/ws`);
  });
});

// ---------------------------------------------------------------------------
// Mock message handler — replace with real runtime dispatch in step 5
// ---------------------------------------------------------------------------

function handleWsMessage(ws, msg) {
  if (msg.type === "RUN_REQUEST") {
    const runId = `run_${Date.now()}`;
    simulateMockRun(ws, runId, msg.query);
  } else if (msg.type === "USER_INPUT_RESPONSE") {
    // Real HITL response handling goes here in step 7
    console.log("[ws] user input response:", msg);
  }
}

async function simulateMockRun(ws, runId, query) {
  const send = (event) => ws.send(JSON.stringify(event));

  send({ type: "RUN_STARTED", runId, workflowType: "deep-research",
         timestamp: new Date().toISOString() });

  await delay(400);
  send({ type: "STATUS", runId, message: "Creating research scope…",
         timestamp: new Date().toISOString() });

  await delay(800);
  send({ type: "SCOPE_CREATED", runId, artifactPath: "research/mock/scope.md",
         timestamp: new Date().toISOString() });

  await delay(600);
  // Simulate the HITL gate
  send({
    type: "USER_INPUT_REQUIRED",
    runId,
    prompt: `Scope created for: "${query}". Proceed with literature sweep?`,
    choices: ["Launch sweep", "Revise scope"],
    contextArtifact: "research/mock/scope.md",
    timestamp: new Date().toISOString(),
  });

  // In the real implementation, we'd await the user's WebSocket response here.
  // For the mock, we auto-approve after 2 seconds so you can see the full flow.
  await delay(2000);

  send({ type: "STATUS", runId, message: "Literature sweep running…",
         timestamp: new Date().toISOString() });
  await delay(1000);

  send({ type: "TOOL_CALL_STARTED", runId, tool: "literature-scout",
         description: "Searching papers…", timestamp: new Date().toISOString() });
  await delay(1200);
  send({ type: "TOOL_CALL_COMPLETED", runId, tool: "literature-scout",
         timestamp: new Date().toISOString() });

  await delay(500);
  send({ type: "ARTIFACT_CREATED", runId,
         path: "research/mock/report.md", title: "Mock Research Report",
         timestamp: new Date().toISOString() });

  await delay(300);
  send({ type: "COMMIT_CREATED", runId, commitHash: "abc1234",
         message: "feat(research): add mock research report",
         timestamp: new Date().toISOString() });

  await delay(200);
  send({ type: "RUN_COMPLETED", runId, artifactPaths: ["research/mock/report.md"],
         timestamp: new Date().toISOString() });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
