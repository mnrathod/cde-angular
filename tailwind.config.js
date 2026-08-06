/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Asite brand colours
        nav:     '#1e3a5f',
        accent:  '#1e5fbe',
        accent2: '#2563eb',
        surface: '#ffffff',
        bg:      '#f0f2f5',
        border:  '#dde1e7',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
