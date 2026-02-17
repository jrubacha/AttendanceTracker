/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        kiosk: {
          bg: '#0f172a',
          surface: '#1e293b',
          accent: '#3b82f6',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#eab308',
          text: '#f8fafc',
          muted: '#94a3b8'
        }
      }
    }
  },
  plugins: []
};
