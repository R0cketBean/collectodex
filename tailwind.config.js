/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'pokemon-blue': '#3B4CCA',
        'pokemon-yellow': '#FFDE00',
        'pokemon-red': '#FF0000',
        'pokemon-light-blue': '#B3A125'
      }
    },
  },
  plugins: [],
}