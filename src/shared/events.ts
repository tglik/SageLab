// Single source of truth for the ResearchEvent schema.
// Imported by both server.ts (emitter) and wsRuntime.ts (consumer).
// Adding a field here catches mismatches at compile time in both places.

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
  | { type: "RUN_FAILED"; runId: string; error: string; code?: string; timestamp: string }
  | { type: "COMMIT_CREATED"; runId: string; commitHash: string; message: string; timestamp: string };

export type OnEvent = (event: ResearchEvent) => void;
