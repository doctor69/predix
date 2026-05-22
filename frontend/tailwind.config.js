/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // CSS-variable-driven palette — auto-switches light/dark via system preference
        bg: {
          primary:   'rgb(var(--color-bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-bg-secondary) / <alpha-value>)',
          card:      'rgb(var(--color-bg-card) / <alpha-value>)',
          hover:     'rgb(var(--color-bg-hover) / <alpha-value>)',
          border:    'rgb(var(--color-bg-border) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          dark:    'rgb(var(--color-accent-dark) / <alpha-value>)',
        },
        text: {
          primary:   'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        // Static yes/no — same in both modes
        yes: {
          DEFAULT: '#16c784',
          dark:    '#0d9e66',
          muted:   'rgba(22, 199, 132, 0.15)',
        },
        no: {
          DEFAULT: '#ea3943',
          dark:    '#c22d35',
          muted:   'rgba(234, 57, 67, 0.15)',
        },
        // Trust blue — constant across modes (used in ConnectModal)
        trust: {
          DEFAULT: '#1652f0',
          light:   '#e8f0fe',
          dark:    '#0e3bbf',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
