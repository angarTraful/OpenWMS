/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DESIGN.md: Data Core Narrative Color Tokens
        surface: {
          DEFAULT: '#131313',
          dim: '#131313',
          bright: '#393939',
          'container-lowest': '#0e0e0e',
          'container-low': '#1c1b1b',
          container: '#201f1f',
          'container-high': '#2a2a2a',
          'container-highest': '#353534',
          variant: '#353534',
        },
        'on-surface': {
          DEFAULT: '#e5e2e1',
          variant: '#cdc3d4',
        },
        'inverse-surface': {
          DEFAULT: '#e5e2e1',
          on: '#313030',
        },
        outline: {
          DEFAULT: '#978d9d',
          variant: '#4b4452',
        },
        primary: {
          DEFAULT: '#dab9ff',
          on: '#460283',
          container: '#bb86fc',
          'on-container': '#4c0f89',
          inverse: '#7743b5',
          fixed: '#eedbff',
          'fixed-dim': '#dab9ff',
          'on-fixed': '#2a0053',
          'on-fixed-variant': '#5e289b',
          // Compatibility fallbacks
          hover: '#c89eff',
          dark: '#dab9ff',
        },
        secondary: {
          DEFAULT: '#ffb1c5',
          on: '#65002f',
          container: '#8b0e45',
          'on-container': '#ff95b4',
          fixed: '#ffd9e1',
          'fixed-dim': '#ffb1c5',
          'on-fixed': '#3f001b',
          'on-fixed-variant': '#8b0e45',
        },
        tertiary: {
          DEFAULT: '#75d1ff',
          on: '#003548',
          container: '#2aaadd',
          'on-container': '#003b50',
          fixed: '#c2e8ff',
          'fixed-dim': '#75d1ff',
          'on-fixed': '#001e2b',
          'on-fixed-variant': '#004d67',
        },
        error: {
          DEFAULT: '#ffb4ab',
          on: '#690005',
          container: '#93000a',
          'on-container': '#ffdad6',
        },
        // Legacy/app background and card aliases mapping to DESIGN.md
        background: {
          light: '#f4f4f5',
          dark: '#131313',
        },
        card: {
          light: '#ffffff',
          dark: '#201f1f',
        },
        border: {
          light: '#e4e4e7',
          dark: '#333333',
        },
      },
      borderRadius: {
        sm: '0.125rem', // 2px
        DEFAULT: '0.25rem', // 4px (DESIGN.md default)
        md: '0.375rem', // 6px
        lg: '0.5rem', // 8px
        xl: '0.75rem', // 12px
        full: '9999px',
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.2)',
        'tonal': '0 0 0 1px #333333',
      }
    },
  },
  plugins: [],
}

