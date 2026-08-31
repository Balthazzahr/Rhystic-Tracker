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
      return <Monitor className={iconSize} />;
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
