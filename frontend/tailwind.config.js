/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        royal: 'var(--royal)',
        'royal-dark': 'var(--royal-dark)',
        'royal-ink': 'var(--royal-ink)',
        'royal-soft': 'var(--royal-soft)',
        pink: 'var(--pink)',
        'pink-ink': 'var(--pink-ink)',
        'pink-soft': 'var(--pink-soft)',
        charcoal: 'var(--charcoal)',
        'charcoal-2': 'var(--charcoal-2)',
        'on-charcoal': 'var(--on-charcoal)',
        'charcoal-muted': 'var(--charcoal-muted)',
      },
      fontFamily: {
        display: ['"Familjen Grotesk"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        sans: ['"IBM Plex Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { DEFAULT: '5px', md: '6px', lg: '6px' },
      boxShadow: { DEFAULT: 'none', sm: 'none', md: 'none', lg: 'none' },
    },
  },
  plugins: [],
};
