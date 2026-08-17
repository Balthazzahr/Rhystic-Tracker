import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trophy, CheckCircle2, XCircle, Layers, X, Upload, Download, Copy, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
import { invoke } from '@tauri-apps/api/core';
import { ManaPip } from './ManaPip';
import DeckCardList from './DeckCardList';
import TrueDeckListView from './TrueDeckListView';

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

// Scryfall art crop for the commander header image.
const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

// Mana value histogram (bins 0, 1, 2, 3, 4, 5, 6, 7+). Bars fill the full
// cell height; each bar shows its mana value label underneath, hover shows count.
type Tip = { text: string; x: number; y: number };
function ManaValueHistogram({ bins, palette, onTip }: { bins: number[]; palette: any; onTip: (t: Tip | null) => void }) {
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  // Hide the 0-CMC column if the deck has no 0-cost spells.
  const startIdx = (bins[0] || 0) > 0 ? 0 : 1;
  const visible = bins.slice(startIdx);
  const visibleLabels = labels.slice(startIdx);
  const max = Math.max(...visible, 1);
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex items-end gap-1 min-h-0">
        {visible.map((val, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end">
            <div
              className="w-full rounded-t-sm"
              style={{
                height: `${Math.max((val / max) * 100, 3)}%`,
                backgroundColor: val > 0 ? (palette?.accent || '#38BDF8') : 'rgba(255,255,255,0.1)',
              }}
              onMouseEnter={(e) => onTip({ text: `${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => onTip({ text: `${val} card${val === 1 ? '' : 's'}`, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onTip(null)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1 shrink-0">
        {visibleLabels.map((l, idx) => (
          <span key={idx} className="flex-1 text-center text-[9px] font-mono opacity-60 leading-none">{l}</span>
        ))}
      </div>
    </div>
  );
}

// Card type distribution: horizontal bars, instant hover tooltip shows count.
function CardTypeBars({ data, palette, onTip }: { data: { type: string; count: number }[]; palette: any; onTip: (t: Tip | null) => void }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono opacity-40">No card type data</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex-1 space-y-1 flex flex-col justify-center min-h-0">
      {data.map((d) => (
        <div
          key={d.type}
          className="flex items-center gap-1.5 group cursor-help"
          onMouseEnter={(e) => onTip({ text: `${d.type}: ${d.count}`, x: e.clientX, y: e.clientY })}
          onMouseMove={(e) => onTip({ text: `${d.type}: ${d.count}`, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onTip(null)}
        >
          <span className="w-20 shrink-0 text-[10px] font-semibold truncate" style={{ color: palette?.text }}>{d.type}</span>
          <div className="flex-1 h-1.5 rounded bg-white/5 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: palette?.accent || '#38BDF8' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Mana distribution pie: full pie, no tooltip — each slice renders the mana pip
// symbol shrunk to fit inside the slice.
const MANA_COLORS: Record<string, string> = {
  W: '#F8F6D8', U: '#38BDF8', B: '#A855F7', R: '#F87171', G: '#34D399', C: '#94A3B8',
};
const RADIAN = Math.PI / 180;
function ManaPie({ data }: { data: { color: string; count: number }[] }) {
  if (!data || data.length === 0) return <div className="text-xs font-mono opacity-40">No mana distribution data</div>;
  return (
    <PieChart width={170} height={170}>
      <Pie
        data={data}
        dataKey="count"
        nameKey="color"
        cx="50%"
        cy="50%"
        outerRadius={80}
        paddingAngle={0}
        stroke="none"
        labelLine={false}
        label={(props: any) => {
          const { cx, cy, midAngle, outerRadius, percent, payload } = props;
          if (!payload || percent < 0.04) return null;
          const r = outerRadius * 0.62;
          const x = cx + r * Math.cos(-midAngle * RADIAN);
          const y = cy + r * Math.sin(-midAngle * RADIAN);
          const size = Math.max(10, Math.min(30, outerRadius * 0.95 * Math.sqrt(percent)));
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

  // Opening the import dialog resets the previous result/error so a fresh
  // import never shows a stale confirmation from an earlier deck.
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

  // Load the export text whenever the dialog opens or the mode changes.
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

  // Load the stored True Decklist + status whenever the deck or import changes.
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
        // Default to True Decklist if one exists, else All Logged Cards.
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

  useEffect(() => {
    if (!isOpen) return;
    // Browser-style back navigation: push history so the mouse back button works.
    window.history.pushState({ deckDetail: deckName }, '');
    const onPop = () => onBack();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [isOpen, deckName, onBack]);

  if (!isOpen || !detail) return null;

  const winrateNum = parseFloat(detail.winrate) || 0;
  const playTotal = (detail.play?.wins || 0) + (detail.play?.losses || 0);
  const drawTotal = (detail.draw?.wins || 0) + (detail.draw?.losses || 0);
  const playWinPct = playTotal > 0 ? ((detail.play?.wins || 0) / playTotal) * 100 : 0;
  const drawWinPct = drawTotal > 0 ? ((detail.draw?.wins || 0) / drawTotal) * 100 : 0;

  // Win/loss bar continuum: green fills left-to-right for wins, red fills
  // right-to-left for losses, with win% shown above.
  const winLossBar = (wins: number, losses: number, winPct: number) => {
    const total = wins + losses;
    const winShare = total > 0 ? (wins / total) * 100 : 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono font-bold">
          <span className="text-emerald-400">{wins}W</span>
          <span className="opacity-90" style={{ color: palette?.text }}>{winPct.toFixed(1)}%</span>
          <span className="text-rose-400">{losses}L</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden bg-white/10 relative">
          <div className="h-full bg-emerald-400" style={{ width: `${winShare}%` }} />
          <div className="h-full bg-rose-400 absolute inset-y-0 right-0" style={{ width: `${100 - winShare}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in select-none">
      <div
        className="w-full max-w-6xl h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden relative"
        style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
      >
        {/* Header bar */}
        <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
            style={{ color: palette?.text }}
          >
            <ChevronLeft className="w-4 h-4" /> Deck Library
          </button>
          <button onClick={onBack} className="text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: palette?.border }} title="Close (mouse back)">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Title card (full width) */}
          <div className="px-5 pt-4 shrink-0">
            <div className="p-5 rounded-2xl border space-y-4 group/title" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              {/* Row 1: deck name + commander + mana pips. The deck name wraps
                  (capped at 60% width) and the commander name wraps too, so the
                  mana pips are never pushed off-screen. */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 min-w-0 max-w-[60%]">
                  <h2 className="text-5xl font-black font-outfit uppercase tracking-wide break-words leading-tight min-w-0" style={{ color: palette?.text }}>
                    {detail.deck_name}
                  </h2>
                  {/* Delete deck — shows on hover, red trash icon */}
                  <button
                    onClick={() => onDeleteDeck(detail.deck_name)}
                    className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/20 shrink-0"
                    style={{ color: '#F87171' }}
                    title="Delete deck"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Commander: clickable name opens the card viewer */}
                {detail.commander_name && (
                  <div className="flex items-center gap-4 ml-auto min-w-0">
                    <div className="text-right min-w-0">
                      <p className="text-[10px] font-mono uppercase opacity-50">Commander</p>
                      <button
                        onClick={() => onShowCard({ name: detail.commander_name }, true)}
                        className="text-xl font-bold break-words whitespace-normal leading-tight transition-colors hover:underline"
                        style={{ color: palette?.accent || '#38BDF8' }}
                        title="View card"
                      >
                        {detail.commander_name}
                      </button>
                    </div>
                    <button
                      onClick={() => onShowCard({ name: detail.commander_name }, true)}
                      className="shrink-0"
                      title="View card"
                    >
                      <img
                        src={scryfallArtUrl(detail.commander_name)}
                        alt={detail.commander_name}
                        className="w-20 h-20 rounded-xl object-cover border transition-opacity hover:opacity-80"
                        style={{ borderColor: `${palette?.border}66` }}
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    </button>
                  </div>
                )}

                {/* Mana pips, far right */}
                <div className={`flex gap-1 shrink-0 ${detail.commander_name ? '' : 'ml-auto'}`}>
                  {(detail.colors || []).map((c: string) => <ManaPip key={c} symbol={c} size={34} />)}
                  {(detail.colors || []).length === 0 && <ManaPip symbol="C" size={34} />}
                </div>
              </div>

              {/* Row 2: mana distribution pie + mana value histogram + card types */}
              <div className="grid grid-cols-[auto_1fr_1fr] gap-4 pt-4 border-t" style={{ borderColor: `${palette?.border}66` }}>
                <div className="rounded-xl border p-2 flex flex-col items-center justify-center" style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}66` }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider font-bold mb-1 opacity-60" style={{ color: palette?.accent }}>Mana Distribution</p>
                  <ManaPie data={detail.mana_distribution || []} />
                </div>
                <div className="rounded-xl border p-3 flex flex-col min-h-0" style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}66` }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider font-bold mb-2 opacity-60" style={{ color: palette?.accent }}>Mana Value</p>
                  <ManaValueHistogram bins={detail.mana_curve || [0,0,0,0,0,0,0,0]} palette={palette} onTip={setTip} />
                </div>
                <div className="rounded-xl border p-3 flex flex-col min-h-0" style={{ backgroundColor: palette?.surface, borderColor: `${palette?.border}66` }}>
                  <p className="text-[9px] font-mono uppercase tracking-wider font-bold mb-2 opacity-60" style={{ color: palette?.accent }}>Card Types</p>
                  <CardTypeBars data={detail.card_types || []} palette={palette} onTip={setTip} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left sidebar: stats + recent matches */}
            <div className="w-[300px] shrink-0 border-r flex flex-col" style={{ borderColor: palette?.border }}>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                {/* Winrate */}
                <div className="rounded-2xl border p-3 flex items-center justify-between" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60">Winrate</p>
                    <h3 className="text-3xl font-extrabold font-outfit mt-0.5" style={{ color: winrateNum >= 50 ? '#34D399' : '#F87171' }}>{detail.winrate}</h3>
                  </div>
                  <Trophy className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
                </div>

                {/* W/L record */}
                <div className="rounded-2xl border p-3 flex items-center justify-between" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60">W / L Record</p>
                    <h3 className="text-3xl font-extrabold font-outfit mt-0.5">{detail.wins} - {detail.losses}</h3>
                  </div>
                  <Layers className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
                </div>

                {/* Win rate by position */}
                <div className="rounded-2xl border p-3 space-y-3" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Win Rate by Position</p>
                  <div>
                    <p className="text-[11px] font-mono font-bold uppercase opacity-60 mb-1">On the Play</p>
                    {winLossBar(detail.play?.wins || 0, detail.play?.losses || 0, playWinPct)}
                  </div>
                  <div>
                    <p className="text-[11px] font-mono font-bold uppercase opacity-60 mb-1">On the Draw</p>
                    {winLossBar(detail.draw?.wins || 0, detail.draw?.losses || 0, drawWinPct)}
                  </div>
                </div>
              </div>

              {/* Recent matches (below stats, still in left sidebar) */}
              <div className="p-3 shrink-0 flex flex-col max-h-[40%]">
                <div className="rounded-2xl border flex flex-col overflow-hidden min-h-0" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <div className="px-3 py-2.5 border-b" style={{ borderColor: `${palette?.border}66` }}>
                    <p className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: palette?.accent }}>Recent Matches</p>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar divide-y divide-white/5">
                  {(detail.recent_matches || []).map((m: any) => (
                    <button
                      key={m.match_id}
                      onClick={() => onSelectMatch(m.match_id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                    >
                      {m.result === 'win' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      )}
                      <span className="flex-1 font-semibold text-xs truncate" style={{ color: palette?.text }}>
                        {m.opponent_name || 'Opponent'}
                      </span>
                      <span className="text-[10px] font-mono opacity-50 shrink-0">{formatDateShort(m.timestamp)}</span>
                    </button>
                  ))}
                  {/* View All as a continuation row */}
                  <button
                    onClick={onViewAll}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors"
                    style={{ color: palette?.accent || '#38BDF8' }}
                  >
                    <span className="text-xs font-bold font-mono uppercase tracking-wide">View All →</span>
                  </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Main content area: decklist (True Decklist / All Logged Cards) */}
            <div className="flex-1 p-5 overflow-hidden min-h-0 flex flex-col">
              {/* Source toggle + import */}
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: palette?.border }}>
                  <button
                    onClick={() => setListMode('true')}
                    className={`px-3 py-1 text-[11px] font-mono font-bold transition-colors ${listMode === 'true' ? '' : 'opacity-50 hover:opacity-80'}`}
                    style={{ color: listMode === 'true' ? palette?.accent : palette?.text, backgroundColor: listMode === 'true' ? `${palette?.accent}1a` : 'transparent' }}
                  >
                    True Decklist
                  </button>
                  <button
                    onClick={() => setListMode('logged')}
                    className={`px-3 py-1 text-[11px] font-mono font-bold transition-colors border-l ${listMode === 'logged' ? '' : 'opacity-50 hover:opacity-80'}`}
                    style={{ color: listMode === 'logged' ? palette?.accent : palette?.text, backgroundColor: listMode === 'logged' ? `${palette?.accent}1a` : 'transparent', borderColor: palette?.border }}
                  >
                    All Logged Cards
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={openImport}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border hover:bg-white/5 transition-colors"
                    style={{ color: '#34D399', borderColor: '#34D39955' }}
                    title="Import a decklist from MTGA"
                  >
                    <Download className="w-3.5 h-3.5" /> Import
                  </button>
                  <button
                    onClick={() => setExportOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border hover:bg-white/5 transition-colors"
                    style={{ color: '#F97316', borderColor: '#F9731655' }}
                    title="Export this deck in MTGA format"
                  >
                    <Upload className="w-3.5 h-3.5" /> Export
                  </button>
                </div>
              </div>

              {/* Mode content */}
              {listMode === 'true' && deckListData ? (
                <TrueDeckListView
                  data={deckListData}
                  totalMatches={detail?.total || 0}
                  status={deckListStatus}
                  palette={palette}
                  onShowCard={onShowCard}
                />
              ) : listMode === 'true' ? (
                /* True Decklist selected but none imported yet — show an empty prompt. */
                <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                  <div
                    className="flex flex-col items-center gap-2 text-center cursor-pointer select-none"
                    onClick={openImport}
                  >
                    <p className="text-sm font-mono text-center opacity-40" style={{ color: palette?.text }}>
                      Click Import Decklist
                    </p>
                    <p className="text-[11px] font-mono text-center opacity-25" style={{ color: palette?.text }}>
                      to upload the actual cards in this deck
                    </p>
                  </div>
                </div>
              ) : (
                <DeckCardList deckName={deckName} palette={palette} onShowCard={onShowCard} />
              )}
            </div>
          </div>
        </div>

        {/* Import Decklist dialog */}
        {importOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in select-text"
            onClick={closeImport}
          >
            <div
              className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
              style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
                <div>
                  <p className="text-sm font-bold font-outfit" style={{ color: palette?.text }}>Import Decklist</p>
                  <p className="text-[10px] font-mono opacity-50">Paste the deck export from MTGA (Ctrl+V)</p>
                </div>
                <button onClick={closeImport} className="text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: palette?.border }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder=""
                  autoFocus
                  className="w-full h-56 rounded-xl border p-3 font-mono text-xs leading-relaxed focus:outline-none resize-none custom-scrollbar select-text"
                  style={{ backgroundColor: palette?.mantle, borderColor: palette?.border, color: palette?.text }}
                />

                {importError && (
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {importError}
                  </div>
                )}

                {importResult && (
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Imported {importResult.card_count} cards
                    {importResult.sideboard_count ? ` + ${importResult.sideboard_count} sideboard` : ''}
                    {importResult.unresolved?.length ? `; ${importResult.unresolved.length} unresolved: ${importResult.unresolved.join(', ')}` : ''}
                  </div>
                )}
              </div>

              <div className="p-4 border-t flex items-center justify-end gap-2 shrink-0" style={{ borderColor: palette?.border }}>
                <button
                  onClick={closeImport}
                  disabled={importBusy}
                  className="px-4 py-1.5 rounded-lg border text-xs font-bold opacity-70 hover:opacity-100 transition-opacity disabled:opacity-40"
                  style={{ borderColor: palette?.border, color: palette?.text }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setImportBusy(true); setImportError(null); setImportResult(null);
                    try {
                      const res = await invoke<any>('save_deck_list', { deckName, exportText: importText });
                      setImportResult(res);
                      setListMode('true');
                      setImportText('');
                      onDeckListImported?.();
                    } catch (e: any) {
                      setImportError(String(e));
                    } finally {
                      setImportBusy(false);
                    }
                  }}
                  disabled={importBusy || !importText.trim()}
                  className="px-4 py-1.5 rounded-lg border text-xs font-bold transition-colors disabled:opacity-40"
                  style={{ color: palette?.accent, borderColor: `${palette?.accent}66`, backgroundColor: `${palette?.accent}1a` }}
                >
                  {importBusy ? 'Importing…' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Decklist dialog */}
        {exportOpen && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in select-text"
            onClick={() => setExportOpen(false)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
              style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
                <div>
                  <p className="text-sm font-bold font-outfit" style={{ color: palette?.text }}>Export Decklist</p>
                  <p className="text-[10px] font-mono opacity-50">MTGA-compatible format — select and copy, or use the button below</p>
                </div>
                <button onClick={() => setExportOpen(false)} className="text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: palette?.border }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* Source toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider opacity-50" style={{ color: palette?.text }}>Export</span>
                  <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: palette?.border }}>
                    <button
                      onClick={() => { setExportMode('true'); setCopied(false); }}
                      className={`px-3 py-1 text-[11px] font-mono font-bold transition-colors ${exportMode === 'true' ? '' : 'opacity-50 hover:opacity-80'}`}
                      style={{ color: exportMode === 'true' ? palette?.accent : palette?.text, backgroundColor: exportMode === 'true' ? `${palette?.accent}1a` : 'transparent' }}
                    >
                      True Decklist
                    </button>
                    <button
                      onClick={() => { setExportMode('logged'); setCopied(false); }}
                      className={`px-3 py-1 text-[11px] font-mono font-bold transition-colors border-l ${exportMode === 'logged' ? '' : 'opacity-50 hover:opacity-80'}`}
                      style={{ color: exportMode === 'logged' ? palette?.accent : palette?.text, backgroundColor: exportMode === 'logged' ? `${palette?.accent}1a` : 'transparent', borderColor: palette?.border }}
                    >
                      All Logged Cards
                    </button>
                  </div>
                </div>

                <textarea
                  value={exportText}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  className="w-full h-64 rounded-xl border p-3 font-mono text-xs leading-relaxed focus:outline-none resize-none custom-scrollbar select-text"
                  style={{ backgroundColor: palette?.mantle, borderColor: palette?.border, color: palette?.text }}
                />

                <div className="flex items-center justify-end gap-2">
                  {copied && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Copied
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      setCopied(false);
                      const res = await invoke<any>('export_decklist', { deckName, source: exportMode });
                      if (res && res.text) {
                        setExportText(res.text);
                        await navigator.clipboard.writeText(res.text);
                        setCopied(true);
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border text-xs font-bold transition-colors"
                    style={{ color: '#F97316', borderColor: '#F9731666', backgroundColor: '#F973161a' }}
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy to Clipboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instant hover tooltip (charts) */}
        {tip && (
          <div
            className="fixed z-[70] pointer-events-none px-2 py-1 rounded-md border text-[11px] font-mono font-bold shadow-xl"
            style={{ left: tip.x + 14, top: tip.y + 14, backgroundColor: palette?.mantle, borderColor: palette?.border, color: palette?.text }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}
