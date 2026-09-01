import React from 'react';
import { Laptop, Smartphone, Tablet, Monitor, Gamepad2, Apple } from 'lucide-react';

interface PlatformBadgeProps {
  platform?: string | null;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function formatPlatformName(platform?: string | null): string {
  if (!platform) return 'Unknown';
  const p = platform.toLowerCase();
  if (p.includes('steamdeck') || p.includes('steamos')) return 'Steam Deck';
  if (p.includes('steam')) return 'Steam (PC)';
  if (p.includes('windows') || p.includes('win32') || p.includes('win64') || p.includes('standalone')) return 'Windows PC';
  if (p.includes('ios') || p.includes('iphone')) return 'iPhone';
  if (p.includes('ipad')) return 'iPad';
  if (p.includes('mac') || p.includes('darwin') || p.includes('osx')) return 'macOS';
  if (p.includes('android')) return 'Android';
  if (p.includes('linux')) return 'Linux';
  return platform;
}

function SteamLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.008l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.524-4.524 4.524h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.724L.437 15.07C1.86 20.314 6.643 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0zM7.558 17.067l-1.633-.674c.29-.48.784-.823 1.365-.917l1.432.592c-.035.15-.054.305-.054.465 0 .204.032.399.09.584l-1.2-.05zm8.384-10.428c-1.272 0-2.304 1.032-2.304 2.304 0 1.271 1.032 2.303 2.304 2.303 1.271 0 2.304-1.032 2.304-2.303 0-1.272-1.033-2.304-2.304-2.304zm0 .768c.848 0 1.536.688 1.536 1.536 0 .848-.688 1.536-1.536 1.536-.848 0-1.536-.688-1.536-1.536 0-.848.688-1.536 1.536-1.536z" />
    </svg>
  );
}

export function PlatformBadge({ platform, className = '', showLabel = false, size = 'sm' }: PlatformBadgeProps) {
  if (!platform) return null;

  const raw = platform.toLowerCase();
  const label = formatPlatformName(platform);

  const getIcon = () => {
    const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
    if (raw.includes('steamdeck') || raw.includes('steamos')) {
      return <Gamepad2 className={iconSize} />;
    }
    if (raw.includes('steam')) {
      return <SteamLogo className={iconSize} />;
    }
    if (raw.includes('ios') || raw.includes('iphone')) {
      return <Smartphone className={iconSize} />;
    }
    if (raw.includes('ipad')) {
      return <Tablet className={iconSize} />;
    }
    if (raw.includes('mac') || raw.includes('darwin') || raw.includes('osx')) {
      return <Apple className={iconSize} />;
    }
    if (raw.includes('android')) {
      return <Smartphone className={iconSize} />;
    }
    if (raw.includes('windows') || raw.includes('win32') || raw.includes('win64') || raw.includes('standalone')) {
      return <Monitor className={iconSize} />;
    }
    return <Laptop className={iconSize} />;
  };

  return (
    <div
      className={`inline-flex items-center gap-1 text-[10px] font-mono tracking-wider px-1.5 py-0.5 border border-white/10 bg-white/[0.04] text-neutral-400 select-none ${className}`}
      title={`Platform: ${label} (${platform})`}
    >
      <span className="text-neutral-300 shrink-0">{getIcon()}</span>
      {showLabel && <span className="uppercase">{label}</span>}
    </div>
  );
}

export default PlatformBadge;
