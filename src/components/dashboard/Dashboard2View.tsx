import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Sliders,
  Plus,
  Check,
  X,
  GripVertical,
  Maximize2,
  Minus,
  Sparkles,
  ArrowLeftRight,
  Palette,
} from "lucide-react";
import {
  MatchRecord,
  DashboardStats,
  DashboardLayout,
  WidgetInstance,
  ManaTheme,
} from "./types";
import { WIDGET_REGISTRY, DEFAULT_DASHBOARD_LAYOUT } from "./widgetRegistry";
import { AchievementDetailModal } from "../AchievementDetailModal";
import {
  DashboardColorPickerModal,
  DashboardCustomColors,
  DEFAULT_DASHBOARD_COLORS,
} from "./DashboardColorPickerModal";

interface Dashboard2ViewProps {
  matches: MatchRecord[];
  deckOverview: any[];
  palette: ManaTheme | null;
  formatOptions: { value: string; label: string }[];
  timeOptions: { value: string; label: string }[];
  onSelectMatch: (matchId: string) => void;
  onSelectDeck: (deckName: string) => void;
  onShowCard: (
    card: { name: string; grp_id?: number },
    isCommander: boolean,
  ) => void;
  isTestEnv?: boolean;
  dashboardMode: "2.0" | "legacy";
  setDashboardMode: (mode: "2.0" | "legacy") => void;
}

const localDateKey = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const matchDayKey = (m: { timestamp: string }): string => {
  const d = new Date(m.timestamp);
  if (isNaN(d.getTime())) return "";
  return localDateKey(d);
};

// Row reflow helper to auto-fill space when removing a module
const reflowRowOnRemoval = (
  widgets: WidgetInstance[],
  targetId: string,
): WidgetInstance[] => {
  const rows: WidgetInstance[][] = [];
  let currentRow: WidgetInstance[] = [];
  let currentWidth = 0;

  for (const w of widgets) {
    const wWidth = w.width || 4;
    if (currentWidth + wWidth > 12 && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(w);
    currentWidth += wWidth;
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  const nextRows = rows.map((row) => {
    const foundIdx = row.findIndex((w) => w.id === targetId);
    if (foundIdx === -1) return row;

    const remaining = row.filter((w) => w.id !== targetId);
    if (remaining.length === 0) return [];

    const baseCol = Math.floor(12 / remaining.length);
    let remainder = 12 % remaining.length;

    return remaining.map((w) => {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      return { ...w, width: Math.max(1, Math.min(12, baseCol + extra)) };
    });
  });

  return nextRows.flat();
};

export const Dashboard2View: React.FC<Dashboard2ViewProps> = ({
  matches,
  deckOverview,
  palette,
  formatOptions,
  timeOptions,
  onSelectMatch,
  onSelectDeck,
  onShowCard,
  isTestEnv = false,
  dashboardMode,
  setDashboardMode,
}) => {
  const [layout, setLayout] = useState<DashboardLayout>(() => {
    try {
      const cached = localStorage.getItem("rhystic_dashboard_layout");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_DASHBOARD_LAYOUT;
  });

  const [customColors, setCustomColors] = useState<DashboardCustomColors>(() => {
    try {
      const cached = localStorage.getItem("rhystic_dashboard_colors");
      if (cached) {
        return { ...DEFAULT_DASHBOARD_COLORS, ...JSON.parse(cached) };
      }
    } catch {}
    return DEFAULT_DASHBOARD_COLORS;
  });

  const [isLoadingLayout, setIsLoadingLayout] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isModulePickerOpen, setIsModulePickerOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [inspectedAchievement, setInspectedAchievement] = useState<any>(null);

  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const accentColor = palette?.accent || "#38BDF8";
  const todayKey = useMemo(() => localDateKey(new Date()), []);

  const winLossMatches = useMemo(
    () => matches.filter((m) => m.result === "win" || m.result === "loss"),
    [matches],
  );

  const stats: DashboardStats = useMemo(() => {
    const todayMatches = winLossMatches.filter(
      (m) => matchDayKey(m) === todayKey,
    );
    const todayWins = todayMatches.filter((m) => m.result === "win").length;
    const todayLosses = todayMatches.filter((m) => m.result === "loss").length;

    const allWins = winLossMatches.filter((m) => m.result === "win").length;
    const allLosses = winLossMatches.filter((m) => m.result === "loss").length;

    const desc = [...winLossMatches].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    let curType = desc[0]?.result || "";
    let curStreak = 0;
    for (const m of desc) {
      if (m.result === curType) curStreak++;
      else break;
    }

    return {
      todayWins,
      todayLosses,
      todayCount: todayMatches.length,
      todayWinRate:
        todayMatches.length > 0 ? (todayWins / todayMatches.length) * 100 : 0,
      allWins,
      allLosses,
      allCount: winLossMatches.length,
      allWinRate:
        winLossMatches.length > 0 ? (allWins / winLossMatches.length) * 100 : 0,
      curStreak,
      curStreakType: curType as "win" | "loss" | "",
    };
  }, [winLossMatches, todayKey]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: DashboardLayout = await invoke("get_dashboard_layout");
        if (isMounted && res && res.widgets && res.widgets.length > 0) {
          setLayout(res);
          localStorage.setItem("rhystic_dashboard_layout", JSON.stringify(res));
        }
      } catch (err) {
        console.error("Failed to load dashboard layout from SQLite:", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const persistLayout = useCallback(async (newLayout: DashboardLayout) => {
    const sanitized: DashboardLayout = {
      schema_version: 1,
      widgets: newLayout.widgets.map((w, idx) => ({
        id: w.id || `widget-${w.kind}-${idx}`,
        kind: w.kind,
        x: Math.max(0, Math.round(w.x || 0)),
        y: Math.max(0, Math.round(w.y || 0)),
        width: Math.max(1, Math.min(12, Math.round(w.width || 4))),
        height: Math.max(1, Math.min(8, Math.round(w.height || 3))),
        settings: w.settings || {},
      })),
    };

    setLayout(sanitized);
    localStorage.setItem("rhystic_dashboard_layout", JSON.stringify(sanitized));

    try {
      await invoke("save_dashboard_layout", { layout: sanitized });
    } catch (err) {
      console.error("Failed to save dashboard layout to SQLite:", err);
    }
  }, []);

  const handleUpdateWidgetSettings = useCallback(
    (widgetId: string, newSettings: Record<string, any>) => {
      setLayout((prev) => {
        const nextWidgets = prev.widgets.map((w) =>
          w.id === widgetId ? { ...w, settings: newSettings } : w,
        );
        const nextLayout = { ...prev, widgets: nextWidgets };
        persistLayout(nextLayout);
        return nextLayout;
      });
    },
    [persistLayout],
  );

  const handleSaveColors = (newColors: DashboardCustomColors) => {
    setCustomColors(newColors);
    localStorage.setItem("rhystic_dashboard_colors", JSON.stringify(newColors));
  };

  const handleRemoveWidget = (widgetId: string) => {
    setLayout((prev) => {
      const reflowedWidgets = reflowRowOnRemoval(prev.widgets, widgetId);
      const nextLayout = { ...prev, widgets: reflowedWidgets };
      persistLayout(nextLayout);
      return nextLayout;
    });
  };

  const handleAddWidget = (kind: string) => {
    const def = WIDGET_REGISTRY[kind];
    if (!def) return;
    setLayout((prev) => {
      const newId = `widget-${kind}-${Date.now()}`;
      const newWidget: WidgetInstance = {
        id: newId,
        kind,
        x: 0,
        y: prev.widgets.length,
        width: def.defaultWidth,
        height: def.defaultHeight,
        settings: { ...def.defaultSettings },
      };
      const nextLayout = { ...prev, widgets: [...prev.widgets, newWidget] };
      persistLayout(nextLayout);
      return nextLayout;
    });
  };

  const handleAdjustWidth = (widgetId: string, delta: number) => {
    setLayout((prev) => {
      const nextWidgets = prev.widgets.map((w) => {
        if (w.id !== widgetId) return w;
        const nextWidth = Math.max(1, Math.min(12, (w.width || 4) + delta));
        return { ...w, width: nextWidth };
      });
      const nextLayout = { ...prev, widgets: nextWidgets };
      persistLayout(nextLayout);
      return nextLayout;
    });
  };

  const handleAdjustHeight = (widgetId: string, delta: number) => {
    setLayout((prev) => {
      const nextWidgets = prev.widgets.map((w) => {
        if (w.id !== widgetId) return w;
        const nextHeight = Math.max(1, Math.min(8, (w.height || 3) + delta));
        return { ...w, height: nextHeight };
      });
      const nextLayout = { ...prev, widgets: nextWidgets };
      persistLayout(nextLayout);
      return nextLayout;
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedWidgetId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedWidgetId && draggedWidgetId !== id) {
      setDragOverWidgetId(id);
    }
  };

  const handleDragLeave = (e: React.DragEvent, id: string) => {
    if (dragOverWidgetId === id) {
      setDragOverWidgetId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedWidgetId || draggedWidgetId === targetId) {
      setDraggedWidgetId(null);
      setDragOverWidgetId(null);
      return;
    }

    setLayout((prev) => {
      const nextWidgets = [...prev.widgets];
      const dragIdx = nextWidgets.findIndex((w) => w.id === draggedWidgetId);
      const targetIdx = nextWidgets.findIndex((w) => w.id === targetId);

      if (dragIdx !== -1 && targetIdx !== -1) {
        const [removed] = nextWidgets.splice(dragIdx, 1);
        nextWidgets.splice(targetIdx, 0, removed);
        const nextLayout = { ...prev, widgets: nextWidgets };
        persistLayout(nextLayout);
        return nextLayout;
      }
      return prev;
    });

    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };

  const handleDragEnd = () => {
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };

  const handleStartResize = (
    e: React.PointerEvent,
    widgetId: string,
    handleType: "right" | "bottom" | "corner",
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const targetWidget = layout.widgets.find((w) => w.id === widgetId);
    if (!targetWidget) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const initialWidth = targetWidget.width || 4;
    const initialHeight = targetWidget.height || 3;
    const gridWidth = gridContainerRef.current?.offsetWidth || 1200;
    const colPx = gridWidth / 12;
    const rowPx = 156;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      let nextWidth = initialWidth;
      let nextHeight = initialHeight;

      if (handleType === "right" || handleType === "corner") {
        const colDelta = Math.round(dx / colPx);
        nextWidth = Math.max(1, Math.min(12, initialWidth + colDelta));
      }

      if (handleType === "bottom" || handleType === "corner") {
        const rowDelta = Math.round(dy / rowPx);
        nextHeight = Math.max(1, Math.min(8, initialHeight + rowDelta));
      }

      setLayout((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === widgetId ? { ...w, width: nextWidth, height: nextHeight } : w,
        ),
      }));
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      setLayout((latest) => {
        persistLayout(latest);
        return latest;
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const getColSpanClass = (w: WidgetInstance) => {
    const width = w.width || 4;
    switch (width) {
      case 12:
        return "col-span-12";
      case 11:
        return "col-span-12 min-[1100px]:col-span-11";
      case 10:
        return "col-span-12 min-[1100px]:col-span-10";
      case 9:
        return "col-span-12 min-[1100px]:col-span-9";
      case 8:
        return "col-span-12 min-[1100px]:col-span-8";
      case 7:
        return "col-span-12 min-[1100px]:col-span-7";
      case 6:
        return "col-span-12 md:col-span-6";
      case 5:
        return "col-span-12 md:col-span-6 min-[1100px]:col-span-5";
      case 4:
        return "col-span-12 md:col-span-6 min-[1100px]:col-span-4";
      case 3:
        return "col-span-12 md:col-span-6 min-[1100px]:col-span-3";
      case 2:
        return "col-span-12 md:col-span-4 min-[1100px]:col-span-2";
      case 1:
        return "col-span-12 md:col-span-3 min-[1100px]:col-span-1";
      default:
        return "col-span-12 md:col-span-6 min-[1100px]:col-span-4";
    }
  };

  const getRowSpanClass = (w: WidgetInstance) => {
    const h = w.height || 3;
    switch (h) {
      case 1:
        return "row-span-1";
      case 2:
        return "row-span-2";
      case 3:
        return "row-span-3";
      case 4:
        return "row-span-4";
      case 5:
        return "row-span-5";
      case 6:
        return "row-span-6";
      case 7:
        return "row-span-7";
      case 8:
        return "row-span-8";
      default:
        return "row-span-3";
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar overflow-x-hidden w-full px-8 py-4 select-none">
      {/* Top Header & Mode Switcher */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className="ms ms-ability-party text-2xl leading-none"
            style={{ color: accentColor }}
          />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            DASHBOARD
          </h1>
          {isTestEnv && (
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider rounded bg-purple-950/70 border border-purple-500/50 text-purple-300">
              TEST ENV
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              setIsEditMode(!isEditMode);
              setDraggedWidgetId(null);
              setDragOverWidgetId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-sans font-medium transition-all border ${
              isEditMode
                ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm font-semibold"
                : "bg-white/[0.04] text-neutral-300 border-white/10 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {isEditMode ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Done Customizing</span>
              </>
            ) : (
              <>
                <Sliders className="w-3.5 h-3.5" />
                <span>Customize</span>
              </>
            )}
          </button>

          {isEditMode && (
            <>
              {/* Change Colors Button */}
              <button
                onClick={() => setIsColorPickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-sans font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30 transition-all shadow-sm cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Change Colors</span>
              </button>

              {/* Add Widget Button */}
              <button
                onClick={() => setIsModulePickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-sans font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/50 hover:bg-sky-500/30 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Widget</span>
              </button>
            </>
          )}

          <div className="flex items-center bg-white/[0.04] p-0.5 border border-white/10">
            <button
              onClick={() => setDashboardMode("2.0")}
              className={`px-3 py-1 text-xs font-sans font-medium transition-all ${
                dashboardMode === "2.0"
                  ? "bg-white/[0.12] text-white shadow-sm font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setDashboardMode("legacy")}
              className={`px-3 py-1 text-xs font-sans font-medium transition-all ${
                dashboardMode === "legacy"
                  ? "bg-white/[0.12] text-white shadow-sm font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Legacy
            </button>
          </div>
        </div>
      </div>

      {/* Main Bento-Box Widget Grid Workspace */}
      <div className="pt-4 pb-8 flex-1 min-h-0">
        <div
          ref={gridContainerRef}
          className="grid grid-cols-12 gap-4 auto-rows-[140px] [grid-auto-flow:row_dense] items-stretch relative"
        >
          {layout.widgets.map((w) => {
            const def = WIDGET_REGISTRY[w.kind];
            if (!def) return null;
            const Component = def.component;
            const colSpan = getColSpanClass(w);
            const rowSpan = getRowSpanClass(w);
            const isDraggingThis = draggedWidgetId === w.id;
            const isDropTarget = dragOverWidgetId === w.id && draggedWidgetId !== w.id;

            return (
              <div
                key={w.id}
                draggable={isEditMode}
                onDragStart={(e) => handleDragStart(e, w.id)}
                onDragOver={(e) => handleDragOver(e, w.id)}
                onDragLeave={(e) => handleDragLeave(e, w.id)}
                onDrop={(e) => handleDrop(e, w.id)}
                onDragEnd={handleDragEnd}
                className={`${colSpan} ${rowSpan} h-full flex flex-col relative group transition-all duration-150 overflow-hidden ${
                  isDraggingThis
                    ? "opacity-40 border-2 border-dashed border-amber-400/80 scale-[0.99]"
                    : "opacity-100"
                } ${
                  isDropTarget
                    ? "ring-2 ring-amber-400 bg-amber-500/10 shadow-2xl scale-[1.01] z-20"
                    : ""
                } ${
                  isEditMode && !isDraggingThis && !isDropTarget
                    ? "ring-1 ring-white/15 hover:ring-sky-400/60"
                    : ""
                }`}
              >
                {/* Swap Target Visual Badge */}
                {isDropTarget && (
                  <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs pointer-events-none">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black font-sans font-bold text-xs shadow-xl uppercase tracking-wider rounded-xs animate-bounce">
                      <ArrowLeftRight className="w-4 h-4" />
                      <span>Swap with {def.title}</span>
                    </div>
                  </div>
                )}

                {/* Edit Mode Overlay Header & Stepper Controls */}
                {isEditMode && (
                  <div className="absolute top-0 left-0 right-0 z-30 bg-neutral-900/95 border-b border-white/20 px-2 py-1 flex items-center justify-between backdrop-blur-md">
                    {/* Drag Handle */}
                    <div
                      className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-neutral-300 hover:text-white"
                      title="Drag by handle to reorder widget position"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-200 truncate max-w-[140px]">
                        {def.title}
                      </span>
                    </div>

                    {/* Width & Height Steppers & Remove Controls */}
                    <div className="flex items-center gap-1.5">
                      {/* Width Stepper */}
                      <div className="flex items-center bg-black/50 border border-white/15 px-1 py-0.5 rounded-xs">
                        <button
                          onClick={() => handleAdjustWidth(w.id, -1)}
                          disabled={w.width <= 1}
                          className="p-0.5 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          title="Decrease column width"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-[10px] font-mono px-1 text-neutral-300">
                          {w.width || 4}c
                        </span>
                        <button
                          onClick={() => handleAdjustWidth(w.id, 1)}
                          disabled={w.width >= 12}
                          className="p-0.5 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          title="Increase column width"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* Height Stepper */}
                      <div className="flex items-center bg-black/50 border border-white/15 px-1 py-0.5 rounded-xs">
                        <button
                          onClick={() => handleAdjustHeight(w.id, -1)}
                          disabled={w.height <= 1}
                          className="p-0.5 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          title="Decrease height rows"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-[10px] font-mono px-1 text-neutral-300">
                          {w.height || 3}r
                        </span>
                        <button
                          onClick={() => handleAdjustHeight(w.id, 1)}
                          disabled={w.height >= 8}
                          className="p-0.5 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
                          title="Increase height rows"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* Remove Widget Button */}
                      <button
                        onClick={() => handleRemoveWidget(w.id)}
                        title="Remove widget and auto-fill row space"
                        className="p-1 text-neutral-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-500/40 rounded-xs transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Rendered Widget Container */}
                <div className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden ${isEditMode ? "pt-7" : ""}`}>
                  <Component
                    widget={w}
                    matches={matches}
                    winLossMatches={winLossMatches}
                    stats={stats}
                    deckOverview={deckOverview}
                    palette={palette}
                    formatOptions={formatOptions}
                    timeOptions={timeOptions}
                    onSelectMatch={onSelectMatch}
                    onSelectDeck={onSelectDeck}
                    onShowCard={onShowCard}
                    onInspectAchievement={(ach) => setInspectedAchievement(ach)}
                    onUpdateSettings={(newSettings) =>
                      handleUpdateWidgetSettings(w.id, newSettings)
                    }
                    customColors={customColors}
                    isLoading={isLoadingLayout}
                  />
                </div>

                {/* Interactive Border Resizing Handles (Active in Edit Mode) */}
                {isEditMode && (
                  <>
                    {/* Right Border Resize Handle */}
                    <div
                      onPointerDown={(e) => handleStartResize(e, w.id, "right")}
                      className="absolute top-0 right-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-sky-500/50 z-20 transition-colors"
                      title="Drag right edge to resize column width"
                    />

                    {/* Bottom Border Resize Handle */}
                    <div
                      onPointerDown={(e) => handleStartResize(e, w.id, "bottom")}
                      className="absolute bottom-0 left-0 right-0 h-2.5 cursor-ns-resize hover:bg-sky-500/50 z-20 transition-colors"
                      title="Drag bottom edge to resize row height"
                    />

                    {/* Bottom-Right Corner Resize Handle */}
                    <div
                      onPointerDown={(e) => handleStartResize(e, w.id, "corner")}
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-sky-400/90 z-30 flex items-center justify-center bg-white/15 border-t border-l border-white/30 transition-colors"
                      title="Drag corner to resize width and height"
                    >
                      <Maximize2 className="w-2.5 h-2.5 text-neutral-200 rotate-90 pointer-events-none" />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CUSTOMIZE COLORS MODAL */}
      <DashboardColorPickerModal
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        colors={customColors}
        onSaveColors={handleSaveColors}
      />

      {/* MODULE PICKER CATALOG MODAL */}
      {isModulePickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsModulePickerOpen(false)}
        >
          <div
            className="bg-neutral-900 border border-white/20 max-w-2xl w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-display font-bold uppercase tracking-wider text-white">
                  Add Widget to Dashboard
                </h2>
              </div>
              <button
                onClick={() => setIsModulePickerOpen(false)}
                className="p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
              {Object.values(WIDGET_REGISTRY).map((def) => {
                const isAlreadyAdded = layout.widgets.some((w) => w.kind === def.kind);
                return (
                  <div
                    key={def.kind}
                    className="p-3 bg-white/[0.02] border border-white/10 hover:border-white/25 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-white/[0.05] border border-white/10 shrink-0 text-white">
                        {def.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-sans font-bold text-white">
                          {def.title}
                        </div>
                        <div className="text-xs font-sans text-neutral-400">
                          {def.subtitle || "Modular dashboard widget"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-[11px] font-mono text-neutral-500">
                        Default: {def.defaultWidth}c × {def.defaultHeight}r
                      </span>
                      <button
                        onClick={() => {
                          handleAddWidget(def.kind);
                        }}
                        className={`px-2.5 py-1 text-xs font-sans font-semibold transition-all cursor-pointer ${
                          isAlreadyAdded
                            ? "bg-white/[0.05] text-neutral-400 hover:text-white hover:bg-white/[0.1] border border-white/10"
                            : "bg-sky-500/20 text-sky-300 border border-sky-500/50 hover:bg-sky-500/30"
                        }`}
                      >
                        {isAlreadyAdded ? "+ Add Another" : "+ Add to Grid"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setIsModulePickerOpen(false)}
                className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-sans font-semibold text-white transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACHIEVEMENT DRILL-DOWN TROPHY CABINET MODAL */}
      {inspectedAchievement && (
        <AchievementDetailModal
          achievement={inspectedAchievement}
          onClose={() => setInspectedAchievement(null)}
          onShowCard={onShowCard}
          palette={palette}
        />
      )}
    </div>
  );
};
