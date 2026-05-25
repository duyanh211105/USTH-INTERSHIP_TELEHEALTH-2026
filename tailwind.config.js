/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        medical: {
          50: '#eff8ff',
          100: '#d9edff',
          500: '#2f80ed',
          600: '#1d65d8',
          700: '#174fb0',
        },
        mint: {
          50: '#eefcf6',
          100: '#d4f7e7',
          500: '#26b99a',
          600: '#159276',
        },
      },
      boxShadow: {
        soft: '0 18px 45px rgba(28, 78, 121, 0.08)',
      },
    },
  },
  plugins: [],
};
