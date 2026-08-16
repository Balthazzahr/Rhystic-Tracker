import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  palette?: any;
}

/**
 * Dark-themed dropdown. The menu is rendered through a portal to document.body
 * and positioned via the trigger's bounding rect, so it is never clipped by an
 * ancestor's overflow (e.g. the card-viewer overlay) and always stays within the
 * window. Opens downward, but flips upward if there isn't enough room below.
 */
export function CustomDropdown({ options, value, onChange, palette }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuHeight = Math.min(256, options.length * 34 + 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
    setPos({
      top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, [options.length]);

  const open = () => {
    updatePos();
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      // Close when clicking outside the menu (the menu is portaled to body).
      if (pos && (e.target as HTMLElement).closest?.('[data-rt-dropdown-menu]')) return;
      setIsOpen(false);
    };
    const handleScroll = () => setIsOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', () => setIsOpen(false));
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', () => setIsOpen(false));
    };
  }, [pos]);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="w-full mt-1 px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center justify-between transition-all hover:bg-white/5"
        style={{
          backgroundColor: palette?.mantle || '#12141A',
          color: palette?.text || '#F8FAFC',
          borderColor: palette?.border || '#2A2F3D',
        }}
      >
        <span className="truncate">{selectedOption?.label || ''}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && pos && createPortal(
        <div
          data-rt-dropdown-menu
          className="fixed z-[200] rounded-xl border shadow-2xl py-1 max-h-64 overflow-y-auto custom-scrollbar"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxWidth: Math.min(pos.width, window.innerWidth - 16),
            backgroundColor: palette?.surface || '#1A1D24',
            borderColor: palette?.border || '#2A2F3D',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-white/10 flex items-center justify-between"
                style={{
                  color: isSelected ? (palette?.accent || '#38BDF8') : (palette?.text || '#F8FAFC'),
                  backgroundColor: isSelected ? `${palette?.accent || '#38BDF8'}15` : 'transparent',
                }}
              >
                <span>{opt.label}</span>
                {isSelected && <span className="text-[10px] font-mono">✓</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
