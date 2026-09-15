/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#dbe4ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#7c8ff5',
          500: '#4f63d6',
          600: '#2547ad',
          700: '#1d3a8a',
          800: '#172d6b',
          900: '#131f4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
