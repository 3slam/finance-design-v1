/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#B3313D',
          hover: '#A21830',
          tint: '#FDF0F2',
        },
        ink: '#17171C',
        text: {
          secondary: '#5A5A64',
          tertiary: '#88888F',
          muted: '#9A9AA4',
        },
        bg: {
          canvas: '#F7F7F9',
          surface: '#FFFFFF',
          field: '#FAFAFB',
        },
        border: {
          DEFAULT: '#E9E9EE',
        },
        success: {
          DEFAULT: '#34A853',
          dark: '#0C6B43',
          bg: '#E7F6EE',
        },
        warning: {
          DEFAULT: '#B7791F',
          bg: '#FDF3DF',
        },
        danger: {
          DEFAULT: '#D93025',
          bg: '#FDECEA',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-l': ['28px', { lineHeight: '34px', fontWeight: '800' }],
        'heading-xl': ['22px', { lineHeight: '28px', fontWeight: '700' }],
        'heading-l': ['20px', { lineHeight: '26px', fontWeight: '700' }],
        'heading-m': ['16px', { lineHeight: '22px', fontWeight: '600' }],
        'heading-s': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'body-l': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'body-m': ['13px', { lineHeight: '19px', fontWeight: '400' }],
        'body-s': ['12px', { lineHeight: '17px', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};
