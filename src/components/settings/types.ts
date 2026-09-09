export type SettingsTab = 'general' | 'appearance' | 'connection' | 'storage' | 'about';

export const MTG_COLORS = {
  green: {
    base: '#4A7856',
    bg: 'rgba(74, 120, 86, 0.2)',
    border: 'rgba(74, 120, 86, 0.5)',
    text: '#76A382',
    hoverBg: 'rgba(74, 120, 86, 0.3)',
  },
  blue: {
    base: '#4A7FA3',
    bg: 'rgba(74, 127, 163, 0.2)',
    border: 'rgba(74, 127, 163, 0.5)',
    text: '#7FAAC9',
    hoverBg: 'rgba(74, 127, 163, 0.3)',
  },
  red: {
    base: '#B8503A',
    bg: 'rgba(184, 80, 58, 0.2)',
    border: 'rgba(184, 80, 58, 0.5)',
    text: '#D57C69',
    hoverBg: 'rgba(184, 80, 58, 0.3)',
  },
  purple: {
    base: '#374151',
    bg: 'rgba(138, 113, 157, 0.2)',
    border: 'rgba(138, 113, 157, 0.5)',
    text: '#b39ec4',
    hoverBg: 'rgba(138, 113, 157, 0.3)',
  },
  gold: {
    base: '#C5A059',
    bg: 'rgba(197, 160, 89, 0.2)',
    border: 'rgba(197, 160, 89, 0.5)',
    text: '#E5C678',
    hoverBg: 'rgba(197, 160, 89, 0.3)',
  },
};

export interface ManaThemeOption {
  id: string;
  label: string;
  symbol: string;
  color: string;
  desc: string;
}

export const BG_WINDOWS = [
  { id: 'dashboard', label: 'Dashboard', iconClass: 'ms ms-ability-party' },
  { id: 'matches', label: 'Match History', iconClass: 'ms ms-battle' },
  { id: 'decks', label: 'Deck Library', iconClass: 'ms ms-ability-adventure' },
  { id: 'collection', label: 'Card Library', iconClass: 'ms ms-library' },
  { id: 'achievements', label: 'Achievements', iconClass: 'ms ms-ability-duels-renowned' },
  { id: 'leaderboards', label: 'Leaderboards', iconClass: 'ms ms-ability-kicker' },
  { id: 'live', label: 'Live HUD', iconClass: 'ms ms-instant' },
  { id: 'settings', label: 'Settings', iconClass: 'ms ms-ability-prototype' },
];

export const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

