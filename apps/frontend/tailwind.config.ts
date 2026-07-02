import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f5f9ff',
        ink: '#081120',
        electric: '#0b63ff',
        mist: '#d7e6ff',
        panel: '#ffffff',
        line: '#d9e5fb'
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'serif']
      },
      boxShadow: {
        panel: '0 24px 80px rgba(11, 99, 255, 0.12)',
        glow: '0 0 0 1px rgba(11, 99, 255, 0.08), 0 18px 50px rgba(11, 99, 255, 0.18)'
      }
    }
  },
  plugins: []
}

export default config
