import { heroui } from "@heroui/theme";

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Husky AI Brand Colors
      colors: {
        husky: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
      },

      // Custom Font Family
      fontFamily: {
        sans: ['Sora', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      // Custom Animations
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient': 'gradient 8s ease infinite',
      },

      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },

      // Custom Box Shadows
      boxShadow: {
        'husky': '0 4px 14px 0 rgb(139 92 246 / 0.25)',
        'husky-lg': '0 10px 25px -3px rgb(139 92 246 / 0.3)',
        'cyan': '0 4px 14px 0 rgb(6 182 212 / 0.25)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        'glass-lg': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },

      // Custom Background Images (Gradients)
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 50%, #a5f3fc 100%)',
        'gradient-hero-subtle': 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ecfeff 100%)',
        'gradient-husky': 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        'gradient-husky-secondary': 'linear-gradient(135deg, #a78bfa 0%, #22d3ee 100%)',
        'gradient-husky-accent': 'linear-gradient(135deg, #c4b5fd 0%, #67e8f9 100%)',
        'gradient-button': 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
        'gradient-queued': 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        'gradient-processing': 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
        'gradient-building': 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
        'gradient-ready': 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
        'gradient-failed': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
      },

      // Custom Border Radius
      borderRadius: {
        '4xl': '2rem',
      },

      // Custom Backdrop Blur
      backdropBlur: {
        'glass': '12px',
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            // Override primary to use Husky purple
            primary: {
              50: '#f5f3ff',
              100: '#ede9fe',
              200: '#ddd6fe',
              300: '#c4b5fd',
              400: '#a78bfa',
              500: '#8b5cf6',
              600: '#7c3aed',
              700: '#6d28d9',
              800: '#5b21b6',
              900: '#4c1d95',
              DEFAULT: '#8b5cf6',
              foreground: '#ffffff',
            },
            // Secondary uses cyan
            secondary: {
              50: '#ecfeff',
              100: '#cffafe',
              200: '#a5f3fc',
              300: '#67e8f9',
              400: '#22d3ee',
              500: '#06b6d4',
              600: '#0891b2',
              700: '#0e7490',
              800: '#155e75',
              900: '#164e63',
              DEFAULT: '#06b6d4',
              foreground: '#ffffff',
            },
            focus: '#8b5cf6',
          },
        },
        dark: {
          colors: {
            primary: {
              50: '#4c1d95',
              100: '#5b21b6',
              200: '#6d28d9',
              300: '#7c3aed',
              400: '#8b5cf6',
              500: '#a78bfa',
              600: '#c4b5fd',
              700: '#ddd6fe',
              800: '#ede9fe',
              900: '#f5f3ff',
              DEFAULT: '#a78bfa',
              foreground: '#09090b',
            },
            secondary: {
              50: '#164e63',
              100: '#155e75',
              200: '#0e7490',
              300: '#0891b2',
              400: '#06b6d4',
              500: '#22d3ee',
              600: '#67e8f9',
              700: '#a5f3fc',
              800: '#cffafe',
              900: '#ecfeff',
              DEFAULT: '#22d3ee',
              foreground: '#09090b',
            },
            focus: '#a78bfa',
          },
        },
      },
    }),
  ],
};
