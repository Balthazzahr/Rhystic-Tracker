import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Trophy, CheckCircle2, XCircle, Layers, X, Upload, Download, Copy, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
import { invoke } from '@tauri-apps/api/core';
import { ManaPip } from './ManaPip';
import DeckCardList from './DeckCardList';
import TrueDeckListView from './TrueDeckListView';
import { AchievementBadge } from './AchievementBadge';
import { DeckAchievementsModal } from './DeckAchievementsModal';
import CardImage from './CardImage';

interface DeckDetailViewProps {
  isOpen: boolean;
  deckName: string;
  detail: any;
  palette: any;
  onBack: () => void;
  onSelectMatch: (matchId: string) => void;
  onViewAll: () => void;
  onDeckListImported?: () => void;
  formatDateShort: (ts: string) => string;
  onShowCard: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
  onDeleteDeck: (deckName: string) => void;
}

type Tip = { text: string; x: number; y: number };

function ManaValueHistogram({ bins, palette, onTip }: { bins: number[]; palette: any; onTip: (t: Tip | null) => void }) {
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7', '8+'];
  const startIdx = (bins[0] || 0) > 0 ? 0 : 1;
  const visible = bins.slice(startIdx);
  const visibleLabels = labels.slice(startIdx);
  const max = Math.max(...visible, 1);
  return (
    <div className="relative flex-1 flex flex-col min-h-0 w-full h-full justify-end">
      <div className="absolute top-0 inset-x-0 flex justify-center z-10 pointer-events-none">
        <span className="px-2 py-0.2 border border-white/10 bg-black/60 text-[9px] font-mono uppercase tracking-wider font-bold text-neutral-400">
          Mana Curve
        </span>
      </div>

      <div className="flex-1 flex items-end gap-1.5 min-h-0 pt-6">
        {visible.map((val, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end">
            <div
              className="w-full transition-colors hover:opacity-80"
              style={{
                height: `${Math.max((val / max) * 100, 4)}%`,
                backgroundColor: val > 0 ? (palette?.accent || '#8a719d') : 'rgba(255,255,255,0.05)',
              }}
              onMouseEnter={(e) => onTip({ text: `${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => onTip({ text: `${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onTip(null)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5 shrink-0">
        {visibleLabels.map((l, idx) => (
          <span key={idx} className="flex-1 text-center text-[10px] font-mono text-neutral-500 leading-none">{l}</span>
        ))}
      </div>
    </div>
  );
}

function CardTypeBars({ data, palette, onTip }: { data: { type: string; count: number }[]; palette: any; onTip: (t: Tip | null) => void }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono text-neutral-500">No card type data</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex-1 space-y-1.5 flex flex-col justify-center min-h-0">
      {data.map((d) => (
        <div
          key={d.type}
          className="flex items-center gap-2 group cursor-help"
          onMouseEnter={(e) => onTip({ text: `${d.type}: ${d.count}`, x: e.clientX, y: e.clientY })}
          onMouseMove={(e) => onTip({ text: `${d.type}: ${d.count}`, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onTip(null)}
        >
          <span className="w-24 shrink-0 text-xs font-mono font-bold uppercase truncate text-neutral-400">{d.type}</span>
          <div className="flex-1 h-2 bg-neutral-900/80 border border-white/5 overflow-hidden">
            <div className="h-full" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: palette?.accent || '#8a719d' }} />
          </div>
          <span className="text-[10px] font-mono text-neutral-400 tabular-nums w-5 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// Exactly mirror the ManaPip default palette colors
const MANA_COLORS: Record<string, string> = {
  W: '#E8E2CC', // Warm Ivory / Parchment
  U: '#4A7FA3', // Steel Sapphire Blue
  B: '#8a719d', // Obsidian / Deep Violet
  R: '#B8503A', // Brick / Ember Red
  G: '#4A7856', // Forest Moss Green
  C: '#94A3B8', // Colorless Slate
};

const RADIAN = Math.PI / 180;
function ManaPie({ data }: { data: { color: string; count: number }[] }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono text-neutral-500">No mana data</div>;
  return (
    <PieChart width={185} height={170}>
      <Pie
        data={data}
        dataKey="count"
        nameKey="color"
        cx="50%"
        cy="50%"
        outerRadius={76}
        paddingAngle={0}
        stroke="none"
        labelLine={false}
        label={(props: any) => {
          const { cx, cy, midAngle, outerRadius, percent, payload } = props;
          if (!payload || percent < 0.04) return null;
          const r = outerRadius * 0.62;
          const x = cx + r * Math.cos(-midAngle * RADIAN);
          const y = cy + r * Math.sin(-midAngle * RADIAN);
          const size = Math.max(14, Math.min(26, outerRadius * 0.95 * Math.sqrt(percent)));
          return (
            <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
              <div className="w-full h-full flex items-center justify-center">
                <ManaPip symbol={payload.color} size={size} />
              </div>
            </foreignObject>
          );
        }}
      >
        {data.map((d) => <Cell key={d.color} fill={MANA_COLORS[d.color] || '#94A3B8'} />)}
      </Pie>
    </PieChart>
  );
}

export function DeckDetailView({
  isOpen,
  deckName,
  detail,
  palette,
  onBack,
  onSelectMatch,
  onViewAll,
  onDeckListImported,
  formatDateShort,
  onShowCard,
  onDeleteDeck,
}: DeckDetailViewProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const openImport = () => {
    setImportResult(null);
    setImportError(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    if (importBusy) return;
    setImportOpen(false);
  };
  const [deckListData, setDeckListData] = useState<any>(null);
  const [deckListStatus, setDeckListStatus] = useState<any>(null);
  const [listMode, setListMode] = useState<'logged' | 'true'>('logged');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'true' | 'logged'>('true');
  const [exportText, setExportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);

  useEffect(() => {
    if (!exportOpen || !deckName) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await invoke<any>('export_decklist', { deckName, source: exportMode });
        if (!cancelled) {
          setExportText(res?.text || '');
          setCopied(false);
        }
      } catch {
        if (!cancelled) setExportText('');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [exportOpen, exportMode, deckName, importResult]);

  useEffect(() => {
    if (!isOpen || !deckName) { setDeckListData(null); setDeckListStatus(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const [list, status] = await Promise.all([
          invoke<any>('get_deck_list', { deckName }),
          invoke<any>('get_deck_list_status', { deckName }),
        ]);
        if (cancelled) return;
        setDeckListData(list);
        setDeckListStatus(status);
        setListMode(prev => {
          if (prev === 'logged') return list ? 'true' : 'logged';
          return prev;
        });
      } catch (e) {
        if (!cancelled) { setDeckListData(null); setDeckListStatus(null); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, deckName, importResult]);

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isOpen || !deckName) return;
    try {
      window.history.pushState({ deckDetail: deckName }, '');
    } catch (e) {}
    const onPop = () => onBackRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [isOpen, deckName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (achievementsModalOpen) {
          setAchievementsModalOpen(false);
        } else if (exportOpen) {
          setExportOpen(false);
        } else if (importOpen) {
          if (!importBusy) setImportOpen(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, achievementsModalOpen, exportOpen, importOpen, importBusy, onBack]);

  if (!isOpen || !detail) return null;

  const winrateNum = parseFloat(detail.winrate) || 0;
  const playWinPct = detail.play?.total ? (detail.play.wins / detail.play.total) * 100 : 0;
  const drawWinPct = detail.draw?.total ? (detail.draw.wins / detail.draw.total) * 100 : 0;

  const winLossBar = (wins: number, losses: number, winPct: number) => {
    const total = wins + losses;
    const winShare = total > 0 ? (wins / total) * 100 : 50;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono font-bold tabular-nums">
          <span className="text-emerald-400/90">{wins}W</span>
          <span className="text-neutral-200">{winPct.toFixed(1)}%</span>
          <span className="text-rose-400/90">{losses}L</span>
        </div>
        <div className="h-1.5 w-full flex border border-white/10 overflow-hidden bg-neutral-900">
          <div className="h-full bg-emerald-500/80" style={{ width: `${winShare}%` }} />
          <div className="h-full bg-rose-500/80" style={{ width: `${100 - winShare}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div 
      onClick={onBack}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xl animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[95vw] max-w-[1520px] h-[97vh] max-h-[1150px] border border-white/20 bg-neutral-950 shadow-2xl flex flex-col overflow-hidden relative"
      >
        {/* Header bar */}
        <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Deck Library
          </button>
          <button
            onClick={onBack}
            className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Top Title & Floating Analytics Header */}
          <div className="p-5 border-b border-white/10 bg-neutral-900/30 shrink-0 space-y-4">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex flex-col min-w-0 max-w-[60%] space-y-1.5">
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold font-display uppercase tracking-wide text-white truncate">
                    {detail.deck_name}
                  </h2>
                  <button
                    onClick={() => onDeleteDeck(detail.deck_name)}
                    className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer shrink-0"
                    title="Delete deck"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {detail.formats && detail.formats.filter((f: string) => !f.toLowerCase().includes('bot')).length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {detail.formats.filter((f: string) => !f.toLowerCase().includes('bot')).map((fmt: string, idx: number) => (
                      <span
                        key={fmt}
                        className="text-[10.5px] font-mono font-bold tracking-wider uppercase px-2.5 py-0.5 border border-white/15 bg-black/40 text-neutral-300"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Commander Preview */}
              {detail.commander_name && (
                <div className="flex items-center gap-3 ml-auto min-w-0">
                  <div className="text-right min-w-0">
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500">Commander</p>
                    <button
                      onClick={() => onShowCard({ name: detail.commander_name }, true)}
                      className="text-sm sm:text-base font-bold font-display uppercase tracking-wide text-white hover:underline truncate block"
                      title="View card"
                    >
                      {detail.commander_name}
                    </button>
                  </div>
                  <div
                    onClick={() => onShowCard({ name: detail.commander_name }, true)}
                    className="w-14 h-14 border border-white/15 overflow-hidden bg-neutral-900 shrink-0 cursor-pointer shadow"
                  >
                    <CardImage
                      name={detail.commander_name}
                      version="art_crop"
                      alt={detail.commander_name}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  </div>
                </div>
              )}

              {/* Mana pips */}
              <div className={`flex gap-1.5 shrink-0 ${detail.commander_name ? '' : 'ml-auto'}`}>
                {(detail.colors || []).map((c: string) => <ManaPip key={c} symbol={c} size={32} />)}
                {(detail.colors || []).length === 0 && <ManaPip symbol="C" size={32} />}
              </div>
            </div>

            {/* Row 2: Floating Analytics (No inner bounding boxes / darker backgrounds) */}
            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_1fr] gap-6 pt-3 border-t border-white/10 h-[175px] items-center">
              <div className="flex items-center justify-center h-full min-h-0">
                <ManaPie data={detail.mana_distribution || []} />
              </div>
              <div className="flex flex-col h-full min-h-0">
                <ManaValueHistogram bins={detail.mana_curve || [0,0,0,0,0,0,0,0]} palette={palette} onTip={setTip} />
              </div>
              <div className="flex flex-col h-full min-h-0 pr-2">
                <CardTypeBars data={detail.card_types || []} palette={palette} onTip={setTip} />
              </div>
            </div>
          </div>

          {/* Bottom Body Grid */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left sidebar: Floating stats + recent matches */}
            <div className="w-[320px] shrink-0 border-r border-white/10 flex flex-col min-h-0 bg-neutral-950/60 p-4 space-y-4">
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                {/* Winrate */}
                <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono uppercase text-neutral-500">Winrate</p>
                    <h3 className="text-2xl font-mono font-bold mt-0.5 tabular-nums" style={{ color: winrateNum >= 50 ? '#34D399' : '#F87171' }}>
                      {detail.winrate}
                    </h3>
                  </div>
                  <span className="ms ms-ability-duels-renowned text-2xl text-amber-400/70" />
                </div>

                {/* W/L record */}
                <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono uppercase text-neutral-500">W / L Record</p>
                    <h3 className="text-2xl font-mono font-bold mt-0.5 text-white tabular-nums">
                      {detail.wins} - {detail.losses}
                    </h3>
                  </div>
                  <span className="ms ms-battle text-2xl text-neutral-500" />
                </div>

                {/* Win rate by position */}
                <div className="border-b border-white/10 pb-3 space-y-2.5">
                  <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Win Rate by Position</p>
                  <div>
                    <p className="text-[10px] font-mono font-bold uppercase text-neutral-500 mb-1">On the Play</p>
                    {winLossBar(detail.play?.wins || 0, detail.play?.losses || 0, playWinPct)}
                  </div>
                  <div>
                    <p className="text-[10px] font-mono font-bold uppercase text-neutral-500 mb-1">On the Draw</p>
                    {winLossBar(detail.draw?.wins || 0, detail.draw?.losses || 0, drawWinPct)}
                  </div>
                </div>

                {/* Card Achievements Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Card Achievements</p>
                    {(detail.top_card_achievements || []).length > 0 && (
                      <button
                        onClick={() => setAchievementsModalOpen(true)}
                        className="text-[10px] font-mono font-bold text-sky-400 hover:underline cursor-pointer"
                      >
                        View All
                      </button>
                    )}
                  </div>

                  {(detail.top_card_achievements || []).length === 0 ? (
                    <p className="text-xs font-sans italic text-neutral-500 py-1">No achievements earned yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(detail.top_card_achievements || []).slice(0, 3).map((ach: any, idx: number) => (
                        <div 
                          key={`${ach.grp_id}-${ach.achievement}-${idx}`} 
                          className="flex items-center justify-between gap-2 p-1.5 border border-white/5 bg-white/[0.015]"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <AchievementBadge
                              title={ach.achievement}
                              tier={ach.tier}
                              count={ach.count}
                              size="sm"
                              showTitle={false}
                              showCount={false}
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => onShowCard({ name: ach.card_name, grp_id: ach.grp_id }, false)}
                                className="text-xs font-bold font-display uppercase tracking-wide truncate block text-left w-full hover:underline leading-tight text-white"
                                title={ach.card_name}
                              >
                                {ach.card_name}
                              </button>
                              <span className="text-[10px] font-sans text-neutral-400 block truncate mt-0.5">
                                {ach.achievement}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.2 border border-white/10 bg-black/40 text-neutral-300">
                            {ach.count > 1 ? `×${ach.count}` : '1×'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent matches sidebar section */}
              <div className="shrink-0 flex flex-col max-h-[35%] border-t border-white/10 pt-3">
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/10">
                  <p className="text-[10px] font-mono font-bold uppercase text-neutral-400">Recent Matches</p>
                  <button
                    onClick={onViewAll}
                    className="text-[10px] font-mono font-bold text-sky-400 hover:underline uppercase cursor-pointer"
                  >
                    View All →
                  </button>
                </div>
                <div className="overflow-y-auto custom-scrollbar space-y-1">
                  {(detail.recent_matches || []).map((m: any) => (
                    <button
                      key={m.match_id}
                      onClick={() => onSelectMatch(m.match_id)}
                      className="w-full flex items-center gap-2 p-1.5 border border-white/5 bg-black/40 hover:bg-white/5 transition-colors text-left cursor-pointer"
                    >
                      {m.result === 'win' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400/90 shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-rose-400/90 shrink-0" />
                      )}
                      <span className="flex-1 font-bold font-display uppercase tracking-wide text-xs text-white truncate">
                        {m.opponent_name || 'Opponent'}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-neutral-500 shrink-0">
                        {formatDateShort(m.timestamp)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content area: decklist (True Decklist / All Logged Cards) */}
            <div className="flex-1 p-5 overflow-hidden min-h-0 flex flex-col">
              {/* Source toggle + actions */}
              <div className="flex items-center justify-between mb-3.5 shrink-0 flex-wrap gap-2">
                <div className="flex border border-white/10 bg-black/40">
                  <button
                    onClick={() => setListMode('true')}
                    className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      listMode === 'true'
                        ? 'border border-white/20 bg-white/10 text-white'
                        : 'text-neutral-400 hover:text-white border border-transparent'
                    }`}
                  >
                    True Decklist
                  </button>
                  <button
                    onClick={() => setListMode('logged')}
                    className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer border-l border-white/10 ${
                      listMode === 'logged'
                        ? 'border border-white/20 bg-white/10 text-white'
                        : 'text-neutral-400 hover:text-white border border-transparent'
                    }`}
                  >
                    All Logged Cards
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setAchievementsModalOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider px-3 py-1.5 border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    title="View all card achievements won by this deck"
                  >
                    <Trophy className="w-3.5 h-3.5" /> Achievements
                  </button>
                  <button
                    onClick={openImport}
                    className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider px-3 py-1.5 border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                    title="Import a decklist from MTGA"
                  >
                    <Download className="w-3.5 h-3.5" /> Import
                  </button>
                  <button
                    onClick={() => setExportOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider px-3 py-1.5 border border-orange-500/20 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition-colors cursor-pointer"
                    title="Export this deck in MTGA format"
                  >
                    <Upload className="w-3.5 h-3.5" /> Export
                  </button>
                </div>
              </div>

              {/* Mode content */}
              <div className="flex-1 overflow-hidden min-h-0 border border-white/10 bg-neutral-950 p-2">
                {listMode === 'true' && deckListData ? (
                  <TrueDeckListView
                    data={deckListData}
                    totalMatches={detail?.total || 0}
                    status={deckListStatus}
                    palette={palette}
                    onShowCard={onShowCard}
                  />
                ) : listMode === 'true' ? (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-0 h-full">
                    <div
                      className="flex flex-col items-center gap-2 text-center cursor-pointer select-none p-6 border border-dashed border-white/15 hover:border-white/30 transition-colors"
                      onClick={openImport}
                    >
                      <p className="text-base font-display uppercase tracking-wider text-white">
                        Click to Import Decklist
                      </p>
                      <p className="text-xs font-mono text-neutral-400">
                        Upload the full list of cards in this deck from MTG Arena
                      </p>
                    </div>
                  </div>
                ) : (
                  <DeckCardList deckName={deckName} palette={palette} onShowCard={onShowCard} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Import Decklist Modal */}
        {importOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-text"
            onClick={closeImport}
          >
            <div
              className="w-full max-w-2xl border border-white/20 bg-neutral-950 shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
                <div>
                  <p className="text-base font-bold font-display uppercase tracking-wide text-white">Import Decklist</p>
                  <p className="text-xs font-mono text-neutral-400">Paste the deck export from MTG Arena (Ctrl+V)</p>
                </div>
                <button
                  onClick={closeImport}
                  className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Deck&#10;4 Llanowar Elves&#10;4 Lightning Bolt&#10;..."
                  className="w-full h-48 border border-white/10 bg-black/60 p-3 font-mono text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/30 resize-none"
                />

                {importError && (
                  <div className="p-2.5 border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}

                {importResult && (
                  <div className="p-2.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Imported {importResult.mainboard_count} mainboard cards successfully!</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
                  <button
                    onClick={closeImport}
                    className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={importBusy || !importText.trim()}
                    onClick={async () => {
                      setImportBusy(true);
                      setImportError(null);
                      try {
                        const res = await invoke<any>('import_deck_list', {
                          deckName,
                          importText: importText.trim(),
                        });
                        setImportResult(res);
                        onDeckListImported?.();
                      } catch (err: any) {
                        setImportError(String(err));
                      } finally {
                        setImportBusy(false);
                      }
                    }}
                    className="px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {importBusy ? 'Importing…' : 'Import Decklist'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Decklist Modal */}
        {exportOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-text"
            onClick={() => setExportOpen(false)}
          >
            <div
              className="w-full max-w-2xl border border-white/20 bg-neutral-950 shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
                <div>
                  <p className="text-base font-bold font-display uppercase tracking-wide text-white">Export Decklist</p>
                  <p className="text-xs font-mono text-neutral-400">Copy to clipboard for MTG Arena import</p>
                </div>
                <button
                  onClick={setExportOpen.bind(null, false)}
                  className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <textarea
                  readOnly
                  value={exportText}
                  className="w-full h-48 border border-white/10 bg-black/60 p-3 font-mono text-xs text-white resize-none focus:outline-none"
                />
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div className="flex border border-white/10 bg-black/40">
                    <button
                      onClick={() => setExportMode('true')}
                      className={`px-3 py-1 text-xs font-mono font-bold uppercase ${
                        exportMode === 'true' ? 'bg-white/15 text-white' : 'text-neutral-500'
                      }`}
                    >
                      True Decklist
                    </button>
                    <button
                      onClick={() => setExportMode('logged')}
                      className={`px-3 py-1 text-xs font-mono font-bold uppercase border-l border-white/10 ${
                        exportMode === 'logged' ? 'bg-white/15 text-white' : 'text-neutral-500'
                      }`}
                    >
                      Logged Cards
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(exportText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Deck Achievements Modal */}
        <DeckAchievementsModal
          isOpen={achievementsModalOpen}
          onClose={() => setAchievementsModalOpen(false)}
          deckName={deckName}
          achievements={detail?.all_card_achievements || detail?.top_card_achievements || []}
          palette={palette}
          onShowCard={onShowCard}
        />
      </div>
    </div>
  );
}

export default DeckDetailView;
