import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { LiveDeckTrackerPanel, DeckTrackerData } from './LiveDeckTrackerPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import logoImg from '../../assets/RhysticTrackerLogo.svg';
import symbolIcon from '../../assets/RhysticTrackerICON.svg';

export const DeckTrackerOverlayView: React.FC = () => {
  const [trackerData, setTrackerData] = useState<DeckTrackerData | null>(null);
  const [turn, setTurn] = useState<number>(1);
  const [deckName, setDeckName] = useState<string>('Active Deck');
  const [matchFormat, setMatchFormat] = useState<string>('');
  const [isMatchActive, setIsMatchActive] = useState<boolean>(true);
  const [matchResult, setMatchResult] = useState<{ result: string; reasonLabel?: string } | null>(null);

  // Restore saved screen position on mount if enabled
  useEffect(() => {
    const rememberPos = localStorage.getItem('rememberDeckTrackerPosition') !== 'false';
    if (!rememberPos) return;

    try {
      const savedPosRaw = localStorage.getItem('deckTrackerSavedPosition');
      if (savedPosRaw) {
        const { x, y } = JSON.parse(savedPosRaw);
        if (typeof x === 'number' && typeof y === 'number') {
          getCurrentWindow().setPosition(new LogicalPosition(x, y)).catch(console.error);
        }
      }
    } catch (e) {
      console.error('Failed to restore saved deck tracker position:', e);
    }
  }, []);

  // Track and save window position when moved
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let saveTimeout: any = null;

    getCurrentWindow().onMoved(() => {
      const rememberPos = localStorage.getItem('rememberDeckTrackerPosition') !== 'false';
      if (!rememberPos) return;

      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          const win = getCurrentWindow();
          const factor = await win.scaleFactor();
          const physPos = await win.outerPosition();
          const logicalPos = physPos.toLogical(factor);
          localStorage.setItem(
            'deckTrackerSavedPosition',
            JSON.stringify({ x: logicalPos.x, y: logicalPos.y })
          );
          // Also persist directly into backend settings so Tauri window builder creates it at this coordinate
          invoke('save_deck_tracker_position', { x: logicalPos.x, y: logicalPos.y }).catch((err) => {
            console.error('Failed to invoke save_deck_tracker_position:', err);
          });
        } catch (err) {
          console.error('Failed to save deck tracker position:', err);
        }
      }, 250);
    }).then((unsub) => {
      unlisten = unsub;
    }).catch(console.error);

    return () => {
      if (unlisten) unlisten();
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let endDelayTimeout: any = null;

    const poll = async () => {
      try {
        const liveState = await invoke<any>('get_live_match_state');
        if (cancelled) return;
        if (liveState && liveState.is_active && liveState.deck_tracker) {
          setIsMatchActive(true);
          setMatchResult(null);
          setTrackerData(liveState.deck_tracker);
          setTurn(liveState.turn || 1);
          setDeckName(liveState.player_deck_name || 'Active Deck');
          setMatchFormat(liveState.format || '');
        } else if (liveState && liveState.is_active) {
          setIsMatchActive(true);
          setMatchResult(null);
          setTurn(liveState.turn || 1);
          setDeckName(liveState.player_deck_name || 'Active Deck');
          setMatchFormat(liveState.format || '');
        } else if (liveState && (liveState.just_completed || liveState.result)) {
          // A match has just concluded! Keep the live deck tracker for a brief moment,
          // then show victory/defeat before transitioning to standby.
          setMatchResult({
            result: liveState.result || 'defeat',
            reasonLabel: liveState.reason_label || 'Match Concluded',
          });
          if (!endDelayTimeout) {
            endDelayTimeout = setTimeout(() => {
              setIsMatchActive(false);
            }, 3000);
          }
        } else {
          // Idle standby
          setIsMatchActive(false);
          setMatchResult(null);
        }
      } catch (err) {
        console.error('Failed to poll live state in overlay:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 800);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (endDelayTimeout) clearTimeout(endDelayTimeout);
    };
  }, []);

  const handleClose = () => {
    invoke('close_deck_tracker_window').catch(console.error);
  };

  const handleStartDragging = (e: React.MouseEvent) => {
    // Only drag on left-click and not on buttons/inputs
    if (e.button === 0 && !(e.target as HTMLElement).closest('button, input')) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging().catch(console.error);
      });
    }
  };

  return (
    <ErrorBoundary fallbackTitle="Overlay Deck Tracker Error">
      <div
        onMouseDown={handleStartDragging}
        className="w-screen h-screen bg-neutral-950 overflow-hidden select-none flex flex-col border border-white/20 shadow-2xl rounded-none relative"
      >
        {isMatchActive ? (
          <LiveDeckTrackerPanel
            trackerData={trackerData}
            turn={turn}
            deckName={deckName}
            formatName={matchFormat}
            isOverlay={true}
            defaultExpanded={true}
            onDockBack={handleClose}
          />
        ) : (
          /* Standby / Waiting for Match Screen */
          <div className="w-full h-full flex flex-col justify-between p-4 relative select-none bg-neutral-950 text-white">
            {/* Top Bar with Clear Close 'X' Button */}
            <div className="flex items-center justify-between w-full border-b border-white/10 pb-2 z-10 pointer-events-auto">
              <div className="flex items-center gap-1.5">
                <img src={symbolIcon} alt="Rhystic Tracker" className="w-4 h-4 object-contain" />
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-neutral-300">
                  Live Deck Tracker
                </span>
              </div>
              <button
                onClick={handleClose}
                className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/20 rounded-none cursor-pointer"
                title="Close window"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Match Concluded Victory / Defeat Animated Badge or Centered Standby */}
            <div className="flex flex-col items-center justify-center my-auto space-y-4 px-4 text-center z-10">
              {matchResult ? (
                <div
                  className={`w-full py-6 px-4 border flex flex-col items-center justify-center space-y-2.5 animate-in zoom-in-95 duration-200 shadow-2xl ${
                    matchResult.result === 'win'
                      ? 'bg-[#0a120c]/90 border-[#4ADE80]/50'
                      : 'bg-[#220d11]/90 border-[#F87171]/50'
                  }`}
                >
                  <span
                    className={`text-2xl font-display font-bold tracking-[0.16em] uppercase drop-shadow-md ${
                      matchResult.result === 'win' ? 'text-[#4ADE80]' : 'text-[#F87171]'
                    }`}
                  >
                    {matchResult.result === 'win' ? 'VICTORY' : 'DEFEAT'}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-300 bg-black/60 px-2.5 py-0.5 border border-white/10">
                    {matchResult.reasonLabel || 'Match Concluded'}
                  </span>
                </div>
              ) : (
                <>
                  {/* Centered Rhystic Tracker Icon */}
                  <div className="w-16 h-16 flex items-center justify-center p-2.5 bg-neutral-900/80 border border-white/15 shadow-xl">
                    <img
                      src={symbolIcon}
                      alt="Rhystic Tracker"
                      className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]"
                    />
                  </div>

                  {/* Rhystic Tracker Brand Wordmark */}
                  <img
                    src={logoImg}
                    alt="Rhystic Tracker"
                    className="w-40 object-contain opacity-80"
                  />

                  {/* Waiting for Match Header & Message */}
                  <div className="flex flex-col items-center space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-sans font-bold tracking-[0.14em] uppercase text-white">
                        Waiting for Match
                      </span>
                    </div>
                    <p className="text-[10px] font-sans text-neutral-400 leading-relaxed max-w-[210px]">
                      Launch an MTGA match to activate real-time card and draw tracking.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Empty space filler for layout symmetry */}
            <div className="h-2 w-full" />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};
