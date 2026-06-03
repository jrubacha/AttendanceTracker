/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Precision Guessworks (FIRST Team 1646) brand palette.
        // Dark theme — digital applications favor overlapping grays with pops of red.
        kiosk: {
          bg: '#181818',          // near-black base background
          surface: '#222222',     // PG dark gray (#222222)
          surface2: '#2c2c2d',    // raised layer
          border: '#3a3a3c',      // PG gray (#3a3a3c)
          accent: '#9e0001',      // PG signature red (#9e0001)
          accentHover: '#bd0102', // brightened red for interactive feedback
          success: '#1f9d4d',     // functional "clock in" green
          danger: '#9e0001',      // brand red for clock out / destructive
          warning: '#c8961e',     // functional amber
          text: '#f4f4f4',
          muted: '#929292'        // PG mid gray (#929292)
        },
        // De-bluify the default slate ramp — the brand forbids color-tinted grays,
        // so remap slate to the neutral PG gray scale. Keeps existing slate-* classes on-brand.
        slate: {
          50: '#f4f4f4',
          100: '#e4e4e4',
          200: '#d4d4d4',  // PG #d4d4d4
          300: '#bdbec0',  // PG #bdbec0
          400: '#929292',  // PG #929292
          500: '#747474',  // PG #747474
          600: '#4f5050',  // PG #4f5050
          700: '#3a3a3c',  // PG #3a3a3c
          800: '#262626',
          900: '#1c1c1c',
          950: '#141414'
        }
      },
      fontFamily: {
        // Brand typefaces: Bebas Neue for headings/titles (uppercase, condensed),
        // Glacial Indifference as the clean body face, Neuropol for logo lettering.
        heading: ['"Bebas Neue"', 'Oswald', 'Impact', 'sans-serif'],
        logo: ['Neuropol', '"Bebas Neue"', 'sans-serif'],
        sans: ['"Glacial Indifference"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
      },
      letterSpacing: {
        heading: '0.04em'
      },
      boxShadow: {
        // Subtle red glow used sparingly for emphasis (brand "pop of red").
        accent: '0 0 0 1px rgba(158,0,1,0.4), 0 8px 24px -8px rgba(158,0,1,0.45)'
      }
    }
  },
  plugins: []
};
