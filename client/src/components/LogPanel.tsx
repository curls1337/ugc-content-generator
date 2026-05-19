import { useState } from 'react';
import { Terminal, X, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store';

interface LogEntry {
  time: string;
  type: 'info' | 'error' | 'success';
  message: string;
}

// Global log store
let logs: LogEntry[] = [];
let listeners: (() => void)[] = [];

export function addLog(type: LogEntry['type'], message: string) {
  const time = new Date().toLocaleTimeString();
  logs = [...logs.slice(-49), { time, type, message }];
  listeners.forEach((l) => l());
}

function useLogs() {
  const [, setTick] = useState(0);
  useState(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  });
  return logs;
}

export default function LogPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const currentLogs = useLogs();
  const { activeJobId, jobStatus } = useAppStore();

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 shadow-lg flex items-center justify-center hover:bg-zinc-700 transition-colors"
        aria-label="Toggle logs"
      >
        <Terminal className="w-5 h-5 text-zinc-300" />
        {currentLogs.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent text-white text-[10px] flex items-center justify-center font-bold">
            {currentLogs.length}
          </span>
        )}
      </button>

      {/* Log panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-96 max-h-80 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-zinc-200">Logs</span>
              {activeJobId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {activeJobId.slice(0, 8)}...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {jobStatus && (
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                  jobStatus.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                  jobStatus.status === 'failed' || jobStatus.status === 'canceled' ? 'bg-red-500/20 text-red-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {jobStatus.status}
                </span>
              )}
              <button onClick={() => setIsOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Logs */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px]">
            {currentLogs.length === 0 ? (
              <p className="text-zinc-500 text-center py-4">No logs yet. Generate content to see activity.</p>
            ) : (
              currentLogs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-zinc-600 shrink-0">{log.time}</span>
                  <span className={
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-emerald-400' :
                    'text-zinc-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
