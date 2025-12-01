import { heroui } from "@heroui/react";

export default heroui({
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
});
