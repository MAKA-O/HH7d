/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          950: '#05070d',
          900: '#080c16',
          800: '#0c1220',
          700: '#121a2c',
        },
        accent: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(129, 140, 248, 0.25), 0 20px 60px -20px rgba(79, 70, 229, 0.55)',
        card: '0 1px 0 0 rgba(255, 255, 255, 0.04) inset, 0 24px 60px -32px rgba(0, 0, 0, 0.9)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        'typing-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'fade-in': 'fade-in 0.25s ease-out both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'typing-bounce': 'typing-bounce 1.2s ease-in-out infinite',
        'spin-slow': 'spin-slow 2.4s linear infinite',
      },
    },
  },
  plugins: [],
}
