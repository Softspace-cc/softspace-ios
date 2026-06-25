/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        softspace: {
          50: '#f2f7f7',
          100: '#e2eded',
          200: '#c2dad9',
          300: '#9bbfbe', // muted light teal-gray for secondary text
          400: '#6ba2a0',
          500: '#3f9b96', // calm petrol for accents / muted labels
          600: '#2c847f', // primary actions
          700: '#226763', // hover / darker accent
          800: '#1a2a2b', // dark slate-teal card/nav bg
          900: '#121f20', // deeper panel bg
          950: '#0b1516', // deepest canvas bg
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      }
    },
  },
  plugins: [],
}