/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'rt-base': 'var(--rt-base)',
        'rt-mantle': 'var(--rt-mantle)',
        'rt-surface': 'var(--rt-surface)',
        'rt-border': 'var(--rt-border)',
        'rt-text': 'var(--rt-text)',
        'rt-subtext': 'var(--rt-subtext)',
        'rt-accent': 'var(--rt-accent)',
        'rt-accent-hover': 'var(--rt-accent-hover)',
        'rt-green': 'var(--rt-green)',
        'rt-red': 'var(--rt-red)',
        'rt-yellow': 'var(--rt-yellow)',
        'rt-blue': 'var(--rt-blue)',
      },
      fontSize: {
        'rt-hero': ['34px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'rt-title': ['36px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'rt-section': ['16.5px', { lineHeight: '1.3', letterSpacing: '0.01em' }],
        'rt-card': ['22px', { lineHeight: '1.2' }],
        'rt-label': ['11px', { lineHeight: '1.4', letterSpacing: '0.05em' }],
        'rt-data': ['13.5px', { lineHeight: '1.4' }],
        'rt-narrative': ['15px', { lineHeight: '1.55' }],
        'rt-narrative-sm': ['13.5px', { lineHeight: '1.5' }],
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Beleren', 'serif'],
        beleren: ['Beleren', 'serif'],
        plantin: ['MPlantin', 'serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
