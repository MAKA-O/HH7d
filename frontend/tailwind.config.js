/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          2: 'rgb(var(--fg-2) / <alpha-value>)',
          3: 'rgb(var(--fg-3) / <alpha-value>)',
          inverse: 'rgb(var(--fg-inverse) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
        positive: {
          DEFAULT: 'rgb(var(--positive) / <alpha-value>)',
          soft: 'rgb(var(--positive-soft) / <alpha-value>)',
        },
        caution: {
          DEFAULT: 'rgb(var(--caution) / <alpha-value>)',
          soft: 'rgb(var(--caution-soft) / <alpha-value>)',
        },
        negative: {
          DEFAULT: 'rgb(var(--negative) / <alpha-value>)',
          soft: 'rgb(var(--negative-soft) / <alpha-value>)',
        },
      },
      fontSize: {
        12: ['12px', { lineHeight: '16px' }],
        13: ['13px', { lineHeight: '18px' }],
        14: ['14px', { lineHeight: '20px' }],
        16: ['16px', { lineHeight: '24px' }],
        20: ['20px', { lineHeight: '28px' }],
        24: ['24px', { lineHeight: '32px' }],
        30: ['30px', { lineHeight: '36px' }],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      maxWidth: {
        container: '1200px',
      },
    },
  },
  plugins: [],
}
