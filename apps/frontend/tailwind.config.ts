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
        accent: 'var(--accent)',
        'accent-dark': 'var(--accent-dark)',
        'panel-light': 'var(--panel-light)',
        'panel-dark': 'var(--panel-dark)',
        line: 'var(--line)'
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)']
      },
      boxShadow: {
        panel: '0px 0px 8px rgba(0, 0, 0, 0.04)',
        'panel-dark': '0px 0px 8px rgba(0, 0, 0, 0.2)',
        glow: '0px 0px 16px rgba(11, 99, 255, 0.6)'
      }
    }
  },
  plugins: []
}
export default config