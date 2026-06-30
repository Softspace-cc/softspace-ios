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
          50: 'var(--softspace-50)',
          100: 'var(--softspace-100)',
          200: 'var(--softspace-200)',
          300: 'var(--softspace-300)',
          400: 'var(--softspace-400)',
          500: 'var(--softspace-500)',
          600: 'var(--softspace-600)',
          700: 'var(--softspace-700)',
          800: 'var(--softspace-800)',
          900: 'var(--softspace-900)',
          950: 'var(--softspace-950)',
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