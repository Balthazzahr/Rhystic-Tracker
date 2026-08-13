/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rhysticDark: '#0B0C10',
        rhysticCard: '#1F2833',
        rhysticCyan: '#66FCF1',
        rhysticTeal: '#45A29E',
        rhysticText: '#C5C6C7',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
