/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        appbg: '#000000',
        card: '#111217',
        borderc: '#2b2c36',
      },
      boxShadow: {
        soft: '0 8px 18px -8px rgba(16,24,40,0.15), 0 4px 6px -4px rgba(16,24,40,0.12)',
      },
    },
  },
  plugins: [],
}

