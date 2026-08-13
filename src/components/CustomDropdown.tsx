import React, { useState, useRef, useEffect } from 'react';
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

export function CustomDropdown({ options, value, onChange, palette }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full mt-1 px-3 py-1.5 text-xs font-semibold rounded-xl border flex items-center justify-between transition-all hover:bg-white/5"
        style={{
          backgroundColor: palette?.mantle || '#12141A',
          color: palette?.text || '#F8FAFC',
          borderColor: palette?.border || '#2A2F3D',
        }}
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-2xl py-1 overflow-hidden"
          style={{
            backgroundColor: palette?.surface || '#1A1D24',
            borderColor: palette?.border || '#2A2F3D',
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
        </div>
      )}
    </div>
  );
}
