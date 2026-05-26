"use client";

import { useEffect, useRef, useState } from "react";
import { wsRuntime, type ResearchEvent } from "@/runtime/wsRuntime";

// ---------------------------------------------------------------------------
// Event card renderers
// ---------------------------------------------------------------------------

function StatusCard({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      {message}
    </div>
  );
}

function ScopeCard({ artifactPath }: { artifactPath: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Scope created</div>
      <div className="text-zinc-300 font-mono text-xs break-all">{artifactPath}</div>
    </div>
  );
}

function ToolCallCard({ tool, description, done }: { tool: string; description?: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400 py-1">
      <span className={`w-1.5 h-1.5 rounded-full ${done ? "bg-green-500" : "bg-amber-500 animate-pulse"}`} />
      <span className="font-mono text-xs">{tool}</span>
      {description && <span className="text-zinc-500">{description}</span>}
      {done && <span className="text-green-600 text-xs">✓</span>}
    </div>
  );
}

function ApprovalCard({
  prompt,
  choices,
  contextArtifact,
  runId,
  onChoice,
}: {
  prompt: string;
  choices: string[];
  contextArtifact?: string;
  runId: string;
  onChoice: (runId: string, choice: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4 space-y-3">
      <div className="text-xs font-medium text-amber-500 uppercase tracking-wide">Approval required</div>
      <p className="text-sm text-zinc-200">{prompt}</p>
      {contextArtifact && (
        <div className="text-xs text-zinc-500 font-mono break-all">{contextArtifact}</div>
      )}
      {!chosen ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Approving will continue the workflow.</p>
          <div className="flex gap-2 flex-wrap">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => { setChosen(c); onChoice(runId, c); }}
                className="px-3 py-1.5 rounded-md text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                aria-label={`Choose: ${c}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-zinc-400">→ {chosen}</div>
      )}
    </div>
  );
}

function ArtifactCard({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);

  function copyPath() {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Artifact created</div>
      <div className="text-zinc-200 font-medium">{title}</div>
      <div className="flex items-center gap-2 mt-0.5">
        <div className="text-zinc-500 font-mono text-xs break-all">{path}</div>
        <button
          onClick={copyPath}
          aria-label="Copy artifact path"
          className="shrink-0 text-xs text-zinc-600 hover:text-zinc-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {copied ? "✓" : "⎘"}
        </button>
      </div>
    </div>
  );
}

function CommitCard({ commitHash, message }: { commitHash: string; message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-green-600 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      <span className="font-mono text-xs">{commitHash.slice(0, 7)}</span>
      <span className="text-zinc-400">{message}</span>
    </div>
  );
}

function CompletedCard({ artifactPaths }: { artifactPaths: string[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function copyPath(path: string, idx: number) {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-green-800/50 bg-green-950/20 p-3 text-sm">
      <div className="text-xs font-medium text-green-500 uppercase tracking-wide mb-2">Run completed</div>
      <ul className="space-y-1">
        {artifactPaths.map((p, idx) => (
          <li key={p} className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-300 break-all">{p}</span>
            <button
              onClick={() => copyPath(p, idx)}
              aria-label={`Copy path: ${p}`}
              className="shrink-0 text-xs text-zinc-600 hover:text-zinc-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {copiedIdx === idx ? "✓" : "⎘"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FailedCard({ error, code, onRetry }: { error: string; code?: string; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const detail = code ? `[${code}] ${error}` : error;

  function copyError() {
    navigator.clipboard.writeText(detail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-3 text-sm space-y-2">
      <div className="text-xs font-medium text-red-500 uppercase tracking-wide">Run failed</div>
      <div className="text-red-400 text-xs font-mono break-all">{detail}</div>
      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          Retry
        </button>
        <button
          onClick={copyError}
          className="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {copied ? "Copied" : "Copy error"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message types for the chat thread
// ---------------------------------------------------------------------------

type UserMessage = { role: "user"; text: string };
type EventMessage = { role: "events"; events: ResearchEvent[] };
type ChatMessage = UserMessage | EventMessage;

// ---------------------------------------------------------------------------
// Main chat component
// ---------------------------------------------------------------------------

export function ResearchChat({ token }: { token?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    runId: string; prompt: string; choices: string[];
  } | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Connect WebSocket and subscribe to events
  useEffect(() => {
    if (!wsRuntime) return;
    wsRuntime.connect(token);

    const unsub = wsRuntime.subscribe((event) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "events") {
          return [...prev.slice(0, -1), { role: "events", events: [...last.events, event] }];
        }
        return [...prev, { role: "events", events: [event] }];
      });

      if (event.type === "USER_INPUT_REQUIRED") {
        setPendingApproval({ runId: event.runId, prompt: event.prompt, choices: event.choices });
      }
      if (event.type === "RUN_COMPLETED" || event.type === "RUN_FAILED") {
        setRunning(false);
        setPendingApproval(null);
      }
    });

    return unsub;
  }, [token]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || running) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLastQuery(q);
    setInput("");
    setRunning(true);
    wsRuntime?.sendRunRequest(q);
  }

  function handleChoice(runId: string, choice: string) {
    setPendingApproval(null);
    wsRuntime?.sendUserInputResponse(runId, choice);
  }

  function handleRetry() {
    if (!lastQuery) return;
    setMessages((prev) => [...prev, { role: "user", text: lastQuery }]);
    setRunning(true);
    wsRuntime?.sendRunRequest(lastQuery);
  }

  // E3: Pre-process events to merge TOOL_CALL_STARTED + TOOL_CALL_COMPLETED into
  // a single transitioning card. TOOL_CALL_COMPLETED events are kept in state for
  // correctness but excluded from render; TOOL_CALL_STARTED gets done=true instead.
  function renderEvents(events: ResearchEvent[]) {
    const doneTools = new Set(
      events
        .filter((e): e is Extract<ResearchEvent, { type: "TOOL_CALL_COMPLETED" }> =>
          e.type === "TOOL_CALL_COMPLETED"
        )
        .map((e) => `${e.runId}:${e.tool}`)
    );

    return events.map((event) => {
      const key = `${event.runId}:${event.type}:${event.timestamp}`; // Fix: stable key instead of array index

      switch (event.type) {
        case "STATUS":
          return <StatusCard key={key} message={event.message} />;
        case "SCOPE_CREATED":
          return <ScopeCard key={key} artifactPath={event.artifactPath} />;
        case "TOOL_CALL_STARTED":
          return (
            <ToolCallCard
              key={key}
              tool={event.tool}
              description={event.description}
              done={doneTools.has(`${event.runId}:${event.tool}`)}
            />
          );
        case "TOOL_CALL_COMPLETED":
          return null; // E3: suppressed — TOOL_CALL_STARTED handles both states
        case "USER_INPUT_REQUIRED":
          return (
            <ApprovalCard
              key={key}
              prompt={event.prompt}
              choices={event.choices}
              contextArtifact={event.contextArtifact}
              runId={event.runId}
              onChoice={handleChoice}
            />
          );
        case "ARTIFACT_CREATED":
          return <ArtifactCard key={key} path={event.path} title={event.title} />;
        case "COMMIT_CREATED":
          return <CommitCard key={key} commitHash={event.commitHash} message={event.message} />;
        case "RUN_COMPLETED":
          return <CompletedCard key={key} artifactPaths={event.artifactPaths} />;
        case "RUN_FAILED":
          return <FailedCard key={key} error={event.error} code={event.code} onRetry={handleRetry} />;
        default:
          return null; // TEXT_DELTA suppressed for v0 (see TODOS.md)
      }
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky approval banner — shown when USER_INPUT_REQUIRED is pending */}
      {pendingApproval && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-amber-700/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-400 flex items-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Waiting for your approval — scroll down to respond
        </div>
      )}

      {/* Thread */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-label="Research run events"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="text-center text-zinc-600 text-sm mt-16">
            <div className="text-2xl mb-2">⚗️</div>
            <div>Start a research run</div>
            <div className="text-xs mt-1">Try: "What is the current state of QML for drug discovery?"</div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.role === "events") {
            return (
              <div key={i} className="space-y-2 pl-1">
                {renderEvents(msg.events)}
              </div>
            );
          }

          return null;
        })}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-zinc-800 p-4">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={running}
            placeholder={running ? "Run in progress…" : "Ask the research lab…"}
            aria-label="Research query"
            className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={running || !input.trim()}
            aria-label="Start research run"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            Run
          </button>
        </form>
      </div>
    </div>
  );
}
