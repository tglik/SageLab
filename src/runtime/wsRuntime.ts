// WebSocket runtime adapter for assistant-ui.
// Connects to the server.js WebSocket endpoint and translates
// ResearchEvents into assistant-ui message parts.
//
// In step 5 this gets wired to the real ClaudeCodeRuntime.
// For now the server sends mock events.

export type ResearchEvent =
  | { type: "RUN_STARTED"; runId: string; workflowType: string; timestamp: string }
  | { type: "STATUS"; runId: string; message: string; timestamp: string }
  | { type: "SCOPE_CREATED"; runId: string; artifactPath: string; timestamp: string }
  | { type: "TOOL_CALL_STARTED"; runId: string; tool: string; description: string; timestamp: string }
  | { type: "TOOL_CALL_COMPLETED"; runId: string; tool: string; timestamp: string }
  | { type: "ARTIFACT_CREATED"; runId: string; path: string; title: string; timestamp: string }
  | { type: "USER_INPUT_REQUIRED"; runId: string; prompt: string; choices: string[]; contextArtifact?: string; timestamp: string }
  | { type: "TEXT_DELTA"; runId: string; delta: string; timestamp: string }
  | { type: "RUN_COMPLETED"; runId: string; artifactPaths: string[]; timestamp: string }
  | { type: "RUN_FAILED"; runId: string; error: string; timestamp: string }
  | { type: "COMMIT_CREATED"; runId: string; commitHash: string; message: string; timestamp: string };

export type OnEvent = (event: ResearchEvent) => void;

export class SageLabWsRuntime {
  private ws: WebSocket | null = null;
  private listeners: Set<OnEvent> = new Set();

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const url = `ws://${window.location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (e) => {
      try {
        const event: ResearchEvent = JSON.parse(e.data);
        this.listeners.forEach((l) => l(event));
      } catch {}
    };

    this.ws.onclose = () => {
      // Reconnect after 1s — replays USER_INPUT_REQUIRED on reconnect
      setTimeout(() => this.connect(), 1000);
    };
  }

  subscribe(fn: OnEvent): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  sendRunRequest(query: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
      // Wait for open then send
      this.ws!.onopen = () => this.ws!.send(JSON.stringify({ type: "RUN_REQUEST", query }));
      return;
    }
    this.ws.send(JSON.stringify({ type: "RUN_REQUEST", query }));
  }

  sendUserInputResponse(runId: string, choice: string) {
    this.ws?.send(JSON.stringify({ type: "USER_INPUT_RESPONSE", runId, choice }));
  }
}

// Singleton — one connection per browser tab
export const wsRuntime = typeof window !== "undefined" ? new SageLabWsRuntime() : null;
