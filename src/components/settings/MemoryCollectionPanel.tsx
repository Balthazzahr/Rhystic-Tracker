import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, Copy, Cpu, RefreshCw, ShieldAlert } from 'lucide-react';
import { MTG_COLORS } from './types';

// Mirrors memory_collection.rs — keep the tags in sync.
type Access =
  | { state: 'unsupported' }
  | { state: 'helper_missing'; searched: string[] }
  | { state: 'needs_permission'; helper: string; ptrace_scope: number | null }
  | { state: 'blocked'; helper: string }
  | { state: 'ready'; helper: string; mtga_running: boolean };

type Platform = 'nixos' | 'steamos' | 'arch' | 'linux' | 'macos' | 'windows';

type SyncReport =
  | { outcome: 'synced'; at: string; cards: number }
  | { outcome: 'unchanged'; at: string; cards: number }
  | { outcome: 'failed'; at: string; error: string; detail: string };

interface MemoryCollectionStatus {
  access: Access;
  platform: Platform;
  can_elevate: boolean;
  last_sync: SyncReport | null;
}

type GuideId = 'nixos' | 'arch' | 'steamos' | 'linux' | 'macos';

const GUIDE_LABELS: Record<GuideId, string> = {
  nixos: 'NixOS',
  arch: 'Arch / AUR',
  steamos: 'Steam Deck',
  linux: 'Other Linux',
  macos: 'macOS',
};

const guideFor = (p: Platform): GuideId => (p === 'windows' ? 'linux' : p);

const SYNC_ERRORS: Record<string, string> = {
  not_running: 'MTG Arena is not running.',
  not_logged_in: 'Arena is running but has not loaded your collection yet. Log in and try again.',
  permission_denied: 'The helper was refused access to the Arena process.',
  elevation_cancelled: 'The password prompt was dismissed.',
  elevation_failed: 'Admin authorisation failed.',
  no_pkexec: 'pkexec (polkit) is not installed, so Rhystic can’t ask for admin rights.',
  layout: 'Arena’s memory did not look as expected. A game update may have moved things; retrying can help, otherwise Rhystic needs an update.',
};

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="text-[11px] font-mono text-neutral-200 bg-black/40 border border-white/10 p-3 pr-10 whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 p-1.5 border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] text-neutral-300 cursor-pointer"
        title="Copy"
      >
        {copied ? <Check className="w-3 h-3" style={{ color: MTG_COLORS.green.text }} /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
};

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-sans text-neutral-400">{children}</p>
);

const shellQuote = (p: string) => (/^[\w./~-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);

/** Setup steps per OS. `helper` is the binary we found, if any. */
const Guide: React.FC<{ id: GuideId; helper: string | null }> = ({ id, helper }) => {
  const setcapInPlace = (path: string) => `sudo setcap cap_sys_ptrace+ep ${shellQuote(path)}`;
  const installAndSetcap = (src: string) =>
    `sudo install -m 755 ${shellQuote(src)} /usr/local/bin/rhystic-memread\nsudo setcap cap_sys_ptrace+ep /usr/local/bin/rhystic-memread`;
  const sysctlFallback = `echo 'kernel.yama.ptrace_scope = 0' | sudo tee /etc/sysctl.d/60-ptrace.conf\nsudo sysctl --system`;

  switch (id) {
    case 'nixos':
      return (
        <div className="space-y-2">
          <Note>
            Add a capability wrapper to your system configuration and rebuild. NixOS puts it at{' '}
            <code className="font-mono text-white">/run/wrappers/bin/rhystic-memread</code>, which Rhystic checks first.
          </Note>
          <CodeBlock
            code={`security.wrappers.rhystic-memread = {
  # Point this at the rhystic-memread from however you package Rhystic Tracker.
  source = "\${pkgs.rhystic-tracker}/bin/rhystic-memread";
  capabilities = "cap_sys_ptrace+ep";
  owner = "root";
  group = "root";
};`}
          />
        </div>
      );
    case 'arch':
      return (
        <div className="space-y-2">
          <Note>
            The <code className="font-mono text-white">rhystic-tracker-bin</code> and{' '}
            <code className="font-mono text-white">rhystic-tracker-git</code> AUR packages grant this on install and on every
            upgrade. If you installed some other way, run:
          </Note>
          <CodeBlock code={helper?.startsWith('/usr/') ? setcapInPlace(helper) : installAndSetcap(helper ?? '/path/to/rhystic-memread')} />
        </div>
      );
    case 'steamos':
      return (
        <div className="space-y-2">
          <Note>
            In Desktop Mode, open Konsole. If you have never set a password for the <code className="font-mono text-white">deck</code> user,
            run <code className="font-mono text-white">passwd</code> first, since sudo needs one.
          </Note>
          <CodeBlock code={setcapInPlace(helper ?? '~/.local/bin/rhystic-memread')} />
          <Note>Updating Rhystic replaces the file and drops the capability, so run this again after each update.</Note>
        </div>
      );
    case 'linux':
      return (
        <div className="space-y-2">
          <Note>Copy the helper somewhere root owns and grant it the one capability it needs:</Note>
          <CodeBlock code={installAndSetcap(helper ?? '/path/to/rhystic-memread')} />
          <Note>
            Alternatively, turn off Yama’s ptrace restriction system-wide. This works without touching the helper, but it lets
            any of your programs read any other’s memory, which is exactly what the default protects against. Prefer the
            capability.
          </Note>
          <CodeBlock code={sysctlFallback} />
        </div>
      );
    case 'macos':
      return (
        <Note>
          Not supported yet. macOS only lets root or Apple-signed debuggers read another app’s memory, so this would mean running
          a helper as root. On macOS Rhystic keeps building your collection from the log.
        </Note>
      );
  }
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const LastSync: React.FC<{ report: SyncReport }> = ({ report }) =>
  report.outcome === 'failed' ? (
    <p style={{ color: MTG_COLORS.red.text }}>Last attempt failed: {SYNC_ERRORS[report.error] ?? report.detail}</p>
  ) : (
    <p>
      {report.cards.toLocaleString()} cards owned, as of {formatTime(report.at)}.
    </p>
  );

export const MemoryCollectionPanel: React.FC = () => {
  const [status, setStatus] = useState<MemoryCollectionStatus | null>(null);
  const [guide, setGuide] = useState<GuideId | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const s = await invoke<MemoryCollectionStatus>('get_memory_collection_status');
      setStatus(s);
      setGuide((g) => g ?? guideFor(s.platform));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen('collection-synced', () => refresh());
    return () => {
      unlisten.then((f) => f());
    };
  }, [refresh]);

  const syncNow = async (command: 'sync_collection_from_memory' | 'sync_collection_elevated') => {
    setSyncing(true);
    try {
      await invoke<SyncReport>(command);
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const access = status?.access;
  const helper = access && 'helper' in access ? access.helper : null;
  const ready = access?.state === 'ready';

  const badge = !access
    ? { label: 'Checking…', color: MTG_COLORS.gold }
    : ready
      ? { label: access.mtga_running ? 'Active' : 'Ready, Arena not running', color: MTG_COLORS.green }
      : access.state === 'unsupported'
        ? { label: 'Not available', color: MTG_COLORS.purple }
        : { label: 'Setup needed', color: MTG_COLORS.red };

  return (
    <div className="space-y-3 pt-2">
      <div className="border-b border-white/10 pb-2 flex items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
            Exact Collection Sync (Memory Reading)
          </span>
          <p className="text-xs font-sans text-neutral-400 mt-0.5">
            Arena stopped writing your collection to Player.log in 2021, so Rhystic can only infer it from draws, decklists and
            packs. With memory sync, a small helper reads the real collection from the running client every couple of minutes.
            It only reads, the same way Untapped.gg’s companion works: nothing is injected and no game files are touched.
          </p>
        </div>
        <span
          style={{ backgroundColor: badge.color.bg, borderColor: badge.color.border, color: '#FFFFFF' }}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border text-[10px] font-mono font-bold uppercase tracking-wider shrink-0"
        >
          <Cpu className="w-3 h-3" style={{ color: badge.color.text }} /> {badge.label}
        </span>
      </div>

      {access?.state === 'ready' && (
        <div className="border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs font-sans text-neutral-300 space-y-0.5">
              {status?.last_sync ? (
                <LastSync report={status.last_sync} />
              ) : (
                <p>
                  {access.mtga_running
                    ? 'Arena is running. The first sync happens within two minutes, or sync now.'
                    : 'Start Arena and log in; Rhystic syncs automatically while it runs.'}
                </p>
              )}
              <p className="text-[10px] font-mono text-neutral-500 break-all">helper: {access.helper}</p>
            </div>
            <button
              type="button"
              onClick={() => syncNow('sync_collection_from_memory')}
              disabled={syncing || !access.mtga_running}
              style={{ backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border }}
              className="px-4 py-2 border hover:brightness-125 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync now
            </button>
          </div>
        </div>
      )}

      {access && !ready && (
        <div className="border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: MTG_COLORS.gold.text }} />
            <div className="text-xs font-sans text-neutral-300 space-y-1">
              {access.state === 'helper_missing' && (
                <p>
                  The <code className="font-mono text-white">rhystic-memread</code> helper isn’t installed. It ships next to{' '}
                  <code className="font-mono text-white">rhystic-tracker</code> in the release tarball and the packages; reinstall,
                  or build it with <code className="font-mono text-white">cargo build --release --bin rhystic-memread</code>.
                </p>
              )}
              {access.state === 'needs_permission' && (
                <p>
                  Found the helper, but it isn’t allowed to read other processes’ memory. Your kernel
                  {access.ptrace_scope !== null ? ` has kernel.yama.ptrace_scope = ${access.ptrace_scope}, which` : ''} only lets
                  a program read a process it started itself, and Arena is started by Steam. The helper needs the{' '}
                  <code className="font-mono text-white">CAP_SYS_PTRACE</code> capability. It is a small, read-only program that
                  only gets this one permission; the main app never does.
                </p>
              )}
              {access.state === 'blocked' && (
                <p>
                  Your kernel has ptrace disabled entirely (kernel.yama.ptrace_scope = 3), and no capability gets past that.
                  Mode 3 can’t be lowered while the system is running: set it to 1 in{' '}
                  <code className="font-mono text-white">/etc/sysctl.d</code>, reboot, then follow the steps below.
                </p>
              )}
              {access.state === 'unsupported' && (
                <p>Memory reading isn’t available on this OS yet. Your collection keeps being built from the log.</p>
              )}
            </div>
          </div>

          {access.state === 'needs_permission' && status?.can_elevate && (
            <div className="flex items-center justify-between gap-4 border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-sans text-neutral-300 space-y-1">
                <p>
                  Just want your collection once? Sync with a one-time admin password prompt. Nothing is granted permanently,
                  so automatic syncing stays off until you do the setup below. Arena must be running and logged in.
                </p>
                {status.last_sync && <LastSync report={status.last_sync} />}
              </div>
              <button
                type="button"
                onClick={() => syncNow('sync_collection_elevated')}
                disabled={syncing}
                style={{ backgroundColor: MTG_COLORS.gold.bg, borderColor: MTG_COLORS.gold.border }}
                className="px-4 py-2 border hover:brightness-125 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync once as admin
              </button>
            </div>
          )}

          {access.state !== 'unsupported' && (
            <>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(GUIDE_LABELS) as GuideId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setGuide(id)}
                    style={guide === id ? { backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border } : undefined}
                    className={`px-3 py-1 border text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer ${
                      guide === id ? 'text-white' : 'border-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {GUIDE_LABELS[id]}
                    {status && guideFor(status.platform) === id ? ' · detected' : ''}
                  </button>
                ))}
              </div>
              {guide && <Guide id={guide} helper={helper} />}
              <button
                type="button"
                onClick={refresh}
                disabled={checking}
                className="px-4 py-2 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> Check again
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
