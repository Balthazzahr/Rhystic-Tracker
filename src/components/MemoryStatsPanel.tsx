import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface MemoryStats {
  main_kb: number;
  webkit_kb: number;
  network_kb: number;
  total_kb: number;
}

interface MemoryStatsPanelProps {
  isTestEnv?: boolean;
}

const KB_TO_MB = (kb: number) => (kb / 1024).toFixed(0);

// Dev/test-only live RSS readout for the main Rust process and its WebKit
// children. Gated by isTestEnv — never rendered in production.
export const MemoryStatsPanel: React.FC<MemoryStatsPanelProps> = ({ isTestEnv = false }) => {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isTestEnv) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await invoke<MemoryStats>('get_memory_stats');
        if (!cancelled) setStats(res);
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isTestEnv]);

  if (!isTestEnv || !stats || !visible) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[100] pointer-events-auto select-none">
      <div className="bg-neutral-950/90 border border-white/20 px-2.5 py-1.5 text-[10px] font-mono text-neutral-300 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="text-purple-300 font-bold uppercase tracking-wider text-[9px]">MEM</span>
          <span className="tabular-nums">main {KB_TO_MB(stats.main_kb)}M</span>
          <span className="tabular-nums text-sky-300">web {KB_TO_MB(stats.webkit_kb)}M</span>
          <span className="tabular-nums text-amber-300">net {KB_TO_MB(stats.network_kb)}M</span>
          <span className="text-neutral-500">=</span>
          <span className="tabular-nums font-bold text-white">{KB_TO_MB(stats.total_kb)}M</span>
          <button
            onClick={() => setVisible(false)}
            className="ml-1 text-neutral-500 hover:text-white transition-colors cursor-pointer"
            title="Hide memory panel"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemoryStatsPanel;