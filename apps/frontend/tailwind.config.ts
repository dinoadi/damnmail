import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        ink: 'var(--ink)',
        'ink-secondary': 'var(--ink-secondary)',
        accent: 'var(--accent)',
        'accent-dark': 'var(--accent-dark)',
        'accent-light': 'var(--accent-light)',
        'panel-light': 'var(--panel-light)',
        'panel-dark': 'var(--panel-dark)',
        line: 'var(--line)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)']
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        elevated: '0 4px 6px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
      }
    }
  },
  plugins: []
}
export default config
