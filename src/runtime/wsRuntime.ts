import type { ResearchEvent, OnEvent } from "@/shared/events";

export type { ResearchEvent, OnEvent };

type WsStatus = "connecting" | "connected" | "disconnected";

export class SageLabWsRuntime {
  private ws: WebSocket | null = null;
  private listeners: Set<OnEvent> = new Set();
  private statusListeners: Set<(s: WsStatus) => void> = new Set();
  private pendingMessages: string[] = []; // D2: queue messages sent before socket opens
  private activeRunId: string | null = null; // E4: track active run for WS-close reset
  private token: string | undefined;

  connect(token?: string) {
    this.token = token;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    // D3: auto-detect ws:// vs wss:// based on page protocol
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const path = process.env.NEXT_PUBLIC_SAGELAB_WS_PATH || "/ws";
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${proto}://${window.location.host}${path}${tokenParam}`;

    this.ws = new WebSocket(url);
    this.emitStatus("connecting");

    this.ws.onopen = () => {
      this.emitStatus("connected");
      // D2: Flush messages that were queued while connecting
      for (const msg of this.pendingMessages) {
        this.ws!.send(msg);
      }
      this.pendingMessages = [];
    };

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ResearchEvent;
        if (event.type === "RUN_STARTED") this.activeRunId = event.runId;
        if (event.type === "RUN_COMPLETED" || event.type === "RUN_FAILED") this.activeRunId = null;
        this.listeners.forEach((l) => l(event));
      } catch (err) {
        console.error("[ws] parse error:", err, e.data); // D7: was empty catch
      }
    };

    this.ws.onclose = () => {
      this.emitStatus("disconnected");
      // E1: If a run was in progress when the socket closed, synthesize RUN_FAILED
      // so the UI resets (running=false, input re-enables, error shown)
      if (this.activeRunId !== null) {
        const runId = this.activeRunId;
        this.activeRunId = null;
        const synthetic: ResearchEvent = {
          type: "RUN_FAILED",
          runId,
          error: "Connection lost",
          code: "WS_CLOSED",
          timestamp: new Date().toISOString(),
        };
        this.listeners.forEach((l) => l(synthetic));
      }
      // Reconnect after 1s; server replays USER_INPUT_REQUIRED on reconnect
      setTimeout(() => this.connect(this.token), 1000);
    };
  }

  subscribe(fn: OnEvent): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeStatus(fn: (s: WsStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  sendRunRequest(query: string) {
    // E4b: Validate query before sending
    const q = query.trim();
    if (!q) return;
    if (q.length > 4096) {
      console.warn("[ws] query exceeds 4KB limit, truncating");
    }

    const msg = JSON.stringify({ type: "RUN_REQUEST", query: q.slice(0, 4096) });

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      // D2: Queue message; will flush in onopen
      this.pendingMessages.push(msg);
      this.connect(this.token);
    }
  }

  sendUserInputResponse(runId: string, choice: string) {
    const msg = JSON.stringify({ type: "USER_INPUT_RESPONSE", runId, choice });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg); // E2: check readyState before sending
    } else {
      this.pendingMessages.push(msg); // E2: queue if not open, flush on reconnect
    }
  }

  private emitStatus(status: WsStatus) {
    this.statusListeners.forEach((l) => l(status));
  }
}

// Singleton — one connection per browser tab
export const wsRuntime =
  typeof window !== "undefined" ? new SageLabWsRuntime() : null;
