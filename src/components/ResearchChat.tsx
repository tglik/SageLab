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
      <div className="text-zinc-300 font-mono text-xs">{artifactPath}</div>
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
        <div className="text-xs text-zinc-500 font-mono">{contextArtifact}</div>
      )}
      {!chosen ? (
        <div className="flex gap-2 flex-wrap">
          {choices.map((c) => (
            <button
              key={c}
              onClick={() => { setChosen(c); onChoice(runId, c); }}
              className="px-3 py-1.5 rounded-md text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-zinc-400">→ {chosen}</div>
      )}
    </div>
  );
}

function ArtifactCard({ path, title }: { path: string; title: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Artifact created</div>
      <div className="text-zinc-200 font-medium">{title}</div>
      <div className="text-zinc-500 font-mono text-xs mt-0.5">{path}</div>
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
  return (
    <div className="rounded-lg border border-green-800/50 bg-green-950/20 p-3 text-sm">
      <div className="text-xs font-medium text-green-500 uppercase tracking-wide mb-2">Run completed</div>
      <ul className="space-y-1">
        {artifactPaths.map((p) => (
          <li key={p} className="font-mono text-xs text-zinc-300">{p}</li>
        ))}
      </ul>
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

export function ResearchChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Connect WebSocket and subscribe to events
  useEffect(() => {
    if (!wsRuntime) return;
    wsRuntime.connect();

    const unsub: () => void = wsRuntime.subscribe((event) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "events") {
          // Append to the existing events message
          return [
            ...prev.slice(0, -1),
            { role: "events", events: [...last.events, event] },
          ];
        }
        return [...prev, { role: "events", events: [event] }];
      });

      if (event.type === "RUN_COMPLETED" || event.type === "RUN_FAILED") {
        setRunning(false);
      }
    });

    return unsub;
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || running) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setRunning(true);
    wsRuntime?.sendRunRequest(q);
  }

  function handleChoice(runId: string, choice: string) {
    wsRuntime?.sendUserInputResponse(runId, choice);
  }

  function renderEvent(event: ResearchEvent, i: number) {
    switch (event.type) {
      case "STATUS":
        return <StatusCard key={i} message={event.message} />;
      case "SCOPE_CREATED":
        return <ScopeCard key={i} artifactPath={event.artifactPath} />;
      case "TOOL_CALL_STARTED":
        return <ToolCallCard key={i} tool={event.tool} description={event.description} done={false} />;
      case "TOOL_CALL_COMPLETED":
        return <ToolCallCard key={i} tool={event.tool} done />;
      case "USER_INPUT_REQUIRED":
        return (
          <ApprovalCard
            key={i}
            prompt={event.prompt}
            choices={event.choices}
            contextArtifact={event.contextArtifact}
            runId={event.runId}
            onChoice={handleChoice}
          />
        );
      case "ARTIFACT_CREATED":
        return <ArtifactCard key={i} path={event.path} title={event.title} />;
      case "COMMIT_CREATED":
        return <CommitCard key={i} commitHash={event.commitHash} message={event.message} />;
      case "RUN_COMPLETED":
        return <CompletedCard key={i} artifactPaths={event.artifactPaths} />;
      case "RUN_FAILED":
        return (
          <div key={i} className="text-sm text-red-400 py-1">
            Run failed: {event.error}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                {msg.events.map((event, j) => renderEvent(event, j))}
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
            className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={running || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Run
          </button>
        </form>
      </div>
    </div>
  );
}
