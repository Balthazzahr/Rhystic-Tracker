import React, { useRef } from 'react';
import { Search, X } from 'lucide-react';

export interface GlassSearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearTitle?: string;
  className?: string; // Container className (defaults to 'w-64 shrink-0')
  inputClassName?: string;
}

export const GlassSearchInput: React.FC<GlassSearchInputProps> = ({
  value,
  onChange,
  onClear,
  clearTitle = 'Clear search',
  className,
  inputClassName = '',
  placeholder = 'Search...',
  autoFocus,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const strVal = value ?? '';

  const handleClear = () => {
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  const containerClass = className ?? 'w-64 shrink-0';

  return (
    <div className={`relative h-8 flex items-center ${containerClass}`}>
      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={`w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans ${inputClassName}`}
        {...rest}
      />
      {strVal.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
          title={clearTitle}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
