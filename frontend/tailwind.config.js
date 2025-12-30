/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sky: {
          light: '#87CEEB',
          DEFAULT: '#4A90D9',
          dark: '#1E3A5F',
        },
        cloud: {
          light: '#FFFFFF',
          DEFAULT: '#F0F0F0',
          dark: '#C0C0C0',
        },
        sun: {
          bright: '#FFD700',
          DEFAULT: '#FFA500',
          dim: '#CC8400',
        }
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'dissolve': 'dissolve 400ms ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        dissolve: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.8)' },
        }
      }
    },
  },
  plugins: [],
}
