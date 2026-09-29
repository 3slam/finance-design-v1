/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0b0d',
          1: '#111318',
          2: '#161920',
          3: '#1d212a',
          border: '#262b35',
        },
        accent: {
          DEFAULT: '#4f8cff',
          soft: '#2a3f66',
        },
        money: '#3ecf8e',
        danger: '#ef5f5f',
        warn: '#e2a53a',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
