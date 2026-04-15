/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
        display: ['Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        // SimTrader design tokens — institutional palette with dark mode
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F8F8F7',
          tertiary: '#F2F1EF',
          inverse: '#0F0F0E',
        },
        'dark-surface': {
          DEFAULT: '#0F0F0E',
          secondary: '#1A1A18',
          tertiary: '#2C2C29',
          inverse: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#0F0F0E',
          secondary: '#4A4A47',
          tertiary: '#8A8A85',
          disabled: '#C4C4BF',
        },
        'dark-ink': {
          DEFAULT: '#F2F1EF',
          secondary: '#A8A8A3',
          tertiary: '#5A5A55',
          disabled: '#4A4A47',
        },
        border: {
          DEFAULT: '#E4E4E0',
          strong: '#C4C4BF',
        },
        'dark-border': {
          DEFAULT: '#2C2C29',
          strong: '#3E3E3A',
        },
        accent: {
          DEFAULT: '#1A5CFF',
          hover: '#1450E8',
          muted: '#EEF3FF',
          text: '#1A5CFF',
        },
        'dark-accent': {
          DEFAULT: '#4D88FF',
          hover: '#6B9FFF',
          muted: '#1A5CFF15',
          text: '#4D88FF',
        },
        success: {
          DEFAULT: '#0D7A4E',
          muted: '#E8F7F1',
          text: '#0D7A4E',
        },
        'dark-success': {
          DEFAULT: '#14A06B',
          muted: '#14A06B22',
          text: '#14A06B',
        },
        danger: {
          DEFAULT: '#C8291A',
          muted: '#FEF0EE',
          text: '#C8291A',
        },
        'dark-danger': {
          DEFAULT: '#E0402E',
          muted: '#E0402E22',
          text: '#E0402E',
        },
        warning: {
          DEFAULT: '#B45309',
          muted: '#FFF8EC',
          text: '#B45309',
        },
        'dark-warning': {
          DEFAULT: '#D97706',
          muted: '#D9770622',
          text: '#D97706',
        },
        // Market-specific
        bid: '#0D7A4E',
        ask: '#C8291A',
        neutral: '#4A4A47',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'dark-card': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        dropdown: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        'dark-dropdown': '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        modal: '0 16px 48px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)',
        'dark-modal': '0 16px 48px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
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
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse_dot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.3s ease-out forwards',
        'fade-in': 'fade-in 0.2s ease-out forwards',
        shimmer: 'shimmer 1.8s infinite linear',
        pulse_dot: 'pulse_dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
