import { ResearchChat } from "@/components/ResearchChat";

export default function Home() {
  return (
    <main className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">⚗️</span>
          <span className="font-semibold text-zinc-100">SageLab</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">QML Research</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-zinc-500">Connected</span>
        </div>
      </header>

      {/* Chat — fills the remaining height */}
      <div className="flex-1 overflow-hidden">
        <ResearchChat />
      </div>
    </main>
  );
}
