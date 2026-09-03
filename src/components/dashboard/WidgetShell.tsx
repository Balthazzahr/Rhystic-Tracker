import React from "react";
import { Loader2 } from "lucide-react";

interface WidgetShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  background?: React.ReactNode;
}

export const WidgetShell: React.FC<WidgetShellProps> = ({
  title,
  subtitle,
  icon,
  headerActions,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "No data recorded yet",
  children,
  className = "",
  headerClassName = "",
  background,
}) => {
  return (
    <div
      className={`bg-neutral-950/50 backdrop-blur-md border border-white/10 p-4 flex flex-col h-full rounded-none transition-all duration-200 select-none relative overflow-hidden ${className}`}
    >
      {/* Full-shell background underneath header and body */}
      {background}

      {/* Widget Header */}
      <div
        className={`flex items-center justify-between gap-3 pb-2 border-b border-white/10 shrink-0 relative z-10 ${headerClassName}`}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-[11px] font-sans font-semibold tracking-[0.16em] uppercase text-neutral-200 truncate">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[10px] font-sans text-neutral-400 opacity-80 truncate hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>

        {headerActions && (
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
          </div>
        )}
      </div>

      {/* Widget Body */}
      <div className="flex-1 min-h-0 flex flex-col pt-3 relative">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            <span className="text-xs font-sans tracking-wide">Loading metric...</span>
          </div>
        ) : isEmpty ? (
          <div className="flex-1 flex items-center justify-center py-6 text-center text-xs font-sans italic text-neutral-500">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
