/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        softspace: {
          50: '#f2f7f7',
          100: '#e2eded',
          200: '#c2dad9',
          300: '#9bbfbe',
          400: '#6ba2a0',
          500: '#3f9b96',
          600: '#2c847f',
          700: '#226763',
          800: '#1a2a2b',
          900: '#121f20',
          950: '#0b1516',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Quicksand', 'Outfit', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
