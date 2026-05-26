import { ResearchChat } from "@/components/ResearchChat";
import { ConnectionStatus } from "@/components/ConnectionStatus";

export default function Home() {
  // Pass token from server environment — never exposed in the browser bundle
  const token = process.env.SAGELAB_TOKEN;

  return (
    <main className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">⚗️</span>
          <span className="font-semibold text-zinc-100">SageLab</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">QML Research</span>
        </div>
        <ConnectionStatus />
      </header>

      {/* Chat — fills the remaining height */}
      <div className="flex-1 overflow-hidden">
        <ResearchChat token={token} />
      </div>
    </main>
  );
}
