/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Predix dark theme palette
        bg: {
          primary: '#0a0b0f',
          secondary: '#111318',
          card: '#14161d',
          hover: '#1a1d26',
          border: '#1e2130',
        },
        yes: {
          DEFAULT: '#16c784',
          dark: '#0d9e66',
          muted: 'rgba(22, 199, 132, 0.15)',
        },
        no: {
          DEFAULT: '#ea3943',
          dark: '#c22d35',
          muted: 'rgba(234, 57, 67, 0.15)',
        },
        accent: {
          DEFAULT: '#4c82fb',
          dark: '#3366d9',
        },
        text: {
          primary: '#e8eaf0',
          secondary: '#8b91a7',
          muted: '#4f5569',
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
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
