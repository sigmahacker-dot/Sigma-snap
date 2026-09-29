/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0B0B12',
        panel: '#12121B',
        panel2: '#1A1A26',
        line: '#26263a',
        vio: '#7C5CFF',
        'vio-deep': '#5A3FE0',
        cy: '#38E1FF',
        ink: '#F2F2FA',
        dim: '#9A9AB2',
        danger: '#FF5470',
        gold: '#FFC44D',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { glow: '0 0 24px rgba(124,92,255,.45)', card: '0 8px 32px rgba(0,0,0,.45)' },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'none' } },
        'rec-blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
        'shimmer': { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: { 'fade-up': 'fade-up .25s ease-out', 'rec-blink': 'rec-blink 1.2s infinite' },
    },
  },
  plugins: [],
};
