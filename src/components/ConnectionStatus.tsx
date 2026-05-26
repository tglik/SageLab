"use client";

import { useEffect, useState } from "react";
import { wsRuntime } from "@/runtime/wsRuntime";

const COLOR = {
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-green-500",
  disconnected: "bg-red-500",
} as const;

const LABEL = {
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
} as const;

export function ConnectionStatus() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    if (!wsRuntime) return;
    return wsRuntime.subscribeStatus(setStatus);
  }, []);

  return (
    <div className="flex items-center gap-1.5" aria-label={`WebSocket: ${LABEL[status]}`}>
      <span className={`w-2 h-2 rounded-full ${COLOR[status]}`} />
      <span className="text-xs text-zinc-500">{LABEL[status]}</span>
    </div>
  );
}
