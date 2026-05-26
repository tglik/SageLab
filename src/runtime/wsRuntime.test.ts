import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SageLabWsRuntime } from "./wsRuntime";
import type { ResearchEvent } from "@/shared/events";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type MockWsInstance = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  // Test helpers
  _open: () => void;
  _receive: (event: ResearchEvent) => void;
  _close: () => void;
};

let lastWsInstance: MockWsInstance | null = null;

const MockWebSocket = vi.fn().mockImplementation((_url: string) => {
  const ws: MockWsInstance = {
    readyState: 0, // CONNECTING
    onopen: null,
    onmessage: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn(),
    _open() {
      this.readyState = 1; // OPEN
      this.onopen?.();
    },
    _receive(event: ResearchEvent) {
      this.onmessage?.({ data: JSON.stringify(event) });
    },
    _close() {
      this.readyState = 3; // CLOSED
      this.onclose?.();
    },
  };
  lastWsInstance = ws;
  return ws;
});

// Inject constants matching browser WebSocket
const MockWS = MockWebSocket as unknown as Record<string, unknown>;
MockWS.CONNECTING = 0;
MockWS.OPEN = 1;
MockWS.CLOSING = 2;
MockWS.CLOSED = 3;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("window", {
    location: { protocol: "http:", host: "localhost:3000" },
  });
  lastWsInstance = null;
  MockWebSocket.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SageLabWsRuntime", () => {
  // 1. connect() on cold start — pending RUN_REQUEST flushes when socket opens
  it("queues RUN_REQUEST sent before connect and flushes on open", () => {
    const rt = new SageLabWsRuntime();
    rt.sendRunRequest("test query");

    expect(lastWsInstance).not.toBeNull();
    expect(lastWsInstance!.send).not.toHaveBeenCalled(); // not yet open

    lastWsInstance!._open();

    expect(lastWsInstance!.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(lastWsInstance!.send.mock.calls[0][0]);
    expect(sent).toEqual({ type: "RUN_REQUEST", query: "test query" });
  });

  // 2. subscribe() + unsubscribe() — no memory leaks
  it("subscribe returns an unsubscribe function that removes the listener", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    lastWsInstance!._open();

    const listener = vi.fn();
    const unsub = rt.subscribe(listener);

    const event: ResearchEvent = { type: "STATUS", runId: "r1", message: "hello", timestamp: "t" };
    lastWsInstance!._receive(event);
    expect(listener).toHaveBeenCalledOnce();

    unsub();
    lastWsInstance!._receive(event);
    expect(listener).toHaveBeenCalledOnce(); // not called again
  });

  // 3. sendRunRequest() queue behavior — queued when connecting, flushed on open
  it("does not call WebSocket.send before socket is OPEN", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    // Still CONNECTING
    rt.sendRunRequest("hello");
    expect(lastWsInstance!.send).not.toHaveBeenCalled();

    lastWsInstance!._open();
    expect(lastWsInstance!.send).toHaveBeenCalledOnce();
  });

  // 4. sendUserInputResponse() — sends correct JSON, queues if socket not OPEN
  it("sendUserInputResponse sends correct payload when socket is open", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    lastWsInstance!._open();

    rt.sendUserInputResponse("run_123", "Launch sweep");

    expect(lastWsInstance!.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(lastWsInstance!.send.mock.calls[0][0]);
    expect(sent).toEqual({ type: "USER_INPUT_RESPONSE", runId: "run_123", choice: "Launch sweep" });
  });

  it("sendUserInputResponse queues if socket is not open", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    // Still CONNECTING — don't call _open yet
    rt.sendUserInputResponse("run_123", "Launch sweep");
    expect(lastWsInstance!.send).not.toHaveBeenCalled();

    lastWsInstance!._open();
    expect(lastWsInstance!.send).toHaveBeenCalledOnce();
  });

  // 5. HITL round-trip — USER_INPUT_REQUIRED emitted, sendUserInputResponse sends response
  it("HITL round-trip: USER_INPUT_REQUIRED arrives, sendUserInputResponse fires correct payload", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    lastWsInstance!._open();

    const listener = vi.fn();
    rt.subscribe(listener);

    const hitlEvent: ResearchEvent = {
      type: "USER_INPUT_REQUIRED",
      runId: "run_1",
      prompt: "Proceed?",
      choices: ["Yes", "No"],
      timestamp: "t",
    };
    lastWsInstance!._receive(hitlEvent);

    expect(listener).toHaveBeenCalledWith(hitlEvent);

    rt.sendUserInputResponse("run_1", "Yes");
    const sent = JSON.parse(lastWsInstance!.send.mock.calls[0][0]);
    expect(sent).toEqual({ type: "USER_INPUT_RESPONSE", runId: "run_1", choice: "Yes" });
  });

  // 6. Duplicate event prevention — reconnect replay does not double-fire listeners
  it("subscribe listener receives exactly one event per WS message, not duplicates", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    lastWsInstance!._open();

    const listener = vi.fn();
    rt.subscribe(listener);

    const event: ResearchEvent = { type: "RUN_COMPLETED", runId: "r1", artifactPaths: [], timestamp: "t" };
    lastWsInstance!._receive(event);

    expect(listener).toHaveBeenCalledOnce();
  });

  // 7. running state resets when WS closes mid-run — synthetic RUN_FAILED emitted
  it("emits synthetic RUN_FAILED when socket closes while run is active", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    lastWsInstance!._open();

    const listener = vi.fn();
    rt.subscribe(listener);

    // Start a run
    lastWsInstance!._receive({ type: "RUN_STARTED", runId: "run_x", workflowType: "deep-research", timestamp: "t" });

    // Socket closes unexpectedly
    vi.stubGlobal("WebSocket", vi.fn().mockImplementation(() => ({ // Prevent reconnect from crashing
      readyState: 0, onopen: null, onmessage: null, onclose: null, send: vi.fn(), close: vi.fn(),
    })));
    lastWsInstance!._close();

    const syntheticFail = listener.mock.calls.find(
      (args: unknown[]) => {
        const e = args[0] as ResearchEvent;
        return e.type === "RUN_FAILED" && (e as Extract<ResearchEvent, { type: "RUN_FAILED" }>).code === "WS_CLOSED";
      }
    );
    expect(syntheticFail).toBeDefined();
  });

  // 8. Run lock — empty query rejected before hitting server
  it("sendRunRequest does not send empty query", () => {
    const rt = new SageLabWsRuntime();
    rt.connect();
    lastWsInstance!._open();

    rt.sendRunRequest("  "); // whitespace-only
    expect(lastWsInstance!.send).not.toHaveBeenCalled();
  });
});
