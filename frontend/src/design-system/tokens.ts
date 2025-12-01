/**
 * Husky AI Design System Tokens
 *
 * Inspired by Canva's modern, AI-focused design language with Husky AI's unique identity.
 * Uses a warm purple-to-cyan gradient palette with glassmorphism effects.
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const colors = {
  // Primary Brand Colors - Husky AI Signature
  husky: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',  // Primary brand color
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },

  // Accent Colors - For CTAs and highlights
  accent: {
    cyan: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#06b6d4',
      600: '#0891b2',
    },
    pink: {
      50: '#fdf2f8',
      100: '#fce7f3',
      200: '#fbcfe8',
      300: '#f9a8d4',
      400: '#f472b6',
      500: '#ec4899',
      600: '#db2777',
    },
    amber: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
    },
  },

  // Semantic Colors
  semantic: {
    success: {
      light: '#dcfce7',
      DEFAULT: '#22c55e',
      dark: '#15803d',
    },
    warning: {
      light: '#fef3c7',
      DEFAULT: '#f59e0b',
      dark: '#b45309',
    },
    error: {
      light: '#fee2e2',
      DEFAULT: '#ef4444',
      dark: '#b91c1c',
    },
    info: {
      light: '#dbeafe',
      DEFAULT: '#3b82f6',
      dark: '#1d4ed8',
    },
  },

  // Neutral Palette
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b',
  },

  // Background & Surface Colors
  background: {
    primary: '#ffffff',
    secondary: '#fafafa',
    tertiary: '#f4f4f5',
    elevated: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },

  // Dark Mode Backgrounds
  backgroundDark: {
    primary: '#09090b',
    secondary: '#18181b',
    tertiary: '#27272a',
    elevated: '#27272a',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
} as const;

// ============================================================================
// GRADIENTS
// ============================================================================

export const gradients = {
  // Hero gradient - inspired by Canva's signature look
  hero: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 50%, #a5f3fc 100%)',
  heroSubtle: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ecfeff 100%)',

  // Brand gradients
  huskyPrimary: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
  huskySecondary: 'linear-gradient(135deg, #a78bfa 0%, #22d3ee 100%)',
  huskyAccent: 'linear-gradient(135deg, #c4b5fd 0%, #67e8f9 100%)',

  // Status gradients for job states
  queued: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
  processing: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
  building: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
  ready: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
  failed: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',

  // Input/Card highlight gradient (for focus states)
  focusRing: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',

  // Button gradients
  buttonPrimary: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
  buttonAccent: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
  },

  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    '5xl': ['3rem', { lineHeight: '1.16' }],
    '6xl': ['3.75rem', { lineHeight: '1.1' }],
  },

  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },

  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
  },
} as const;

// ============================================================================
// SPACING
// ============================================================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  DEFAULT: '0.5rem', // 8px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.25rem', // 20px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  // Soft, modern shadows
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',

  // Colored shadows for elevation
  husky: '0 4px 14px 0 rgb(139 92 246 / 0.25)',
  huskyLg: '0 10px 25px -3px rgb(139 92 246 / 0.3)',
  cyan: '0 4px 14px 0 rgb(6 182 212 / 0.25)',

  // Inner shadows for inputs
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',

  // Focus ring shadows
  focusRing: '0 0 0 2px rgb(139 92 246 / 0.5)',
  focusRingCyan: '0 0 0 2px rgb(6 182 212 / 0.5)',
} as const;

// ============================================================================
// BLUR & BACKDROP
// ============================================================================

export const blur = {
  none: '0',
  sm: '4px',
  DEFAULT: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '40px',
  '3xl': '64px',
} as const;

export const backdrop = {
  // Glassmorphism effects
  glass: 'blur(12px) saturate(180%)',
  glassLight: 'blur(8px) saturate(150%)',
  glassHeavy: 'blur(20px) saturate(200%)',
} as const;

// ============================================================================
// TRANSITIONS
// ============================================================================

export const transitions = {
  duration: {
    fast: '150ms',
    DEFAULT: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  timing: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// ============================================================================
// Z-INDEX
// ============================================================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
  toast: 1700,
} as const;

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================================================
// COMPONENT TOKENS
// ============================================================================

export const components = {
  // Card styles
  card: {
    padding: spacing[6],
    borderRadius: borderRadius['2xl'],
    shadow: shadows.md,
    background: colors.background.primary,
    border: `1px solid ${colors.neutral[200]}`,
  },

  // Input styles
  input: {
    height: '2.75rem',
    paddingX: spacing[4],
    borderRadius: borderRadius.xl,
    fontSize: typography.fontSize.base[0],
    background: colors.background.primary,
    border: `1px solid ${colors.neutral[200]}`,
    focusBorder: colors.husky[500],
    placeholder: colors.neutral[400],
  },

  // Button sizes
  button: {
    sm: {
      height: '2rem',
      paddingX: spacing[3],
      fontSize: typography.fontSize.sm[0],
      borderRadius: borderRadius.lg,
    },
    md: {
      height: '2.5rem',
      paddingX: spacing[4],
      fontSize: typography.fontSize.base[0],
      borderRadius: borderRadius.xl,
    },
    lg: {
      height: '3rem',
      paddingX: spacing[6],
      fontSize: typography.fontSize.lg[0],
      borderRadius: borderRadius.xl,
    },
  },

  // Chip/Tag styles (like Canva's category pills)
  chip: {
    height: '2rem',
    paddingX: spacing[3],
    borderRadius: borderRadius.full,
    fontSize: typography.fontSize.sm[0],
  },

  // Sidebar
  sidebar: {
    width: '280px',
    collapsedWidth: '72px',
  },
} as const;

// ============================================================================
// ANIMATIONS
// ============================================================================

export const animations = {
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  slideUp: {
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  slideDown: {
    from: { opacity: 0, transform: 'translateY(-10px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  scaleIn: {
    from: { opacity: 0, transform: 'scale(0.95)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },
  pulse: {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  shimmer: {
    from: { backgroundPosition: '-200% 0' },
    to: { backgroundPosition: '200% 0' },
  },
} as const;

// ============================================================================
// STATUS COLORS (for job states)
// ============================================================================

export const statusColors = {
  queued: {
    bg: colors.accent.amber[100],
    text: colors.accent.amber[500],
    border: colors.accent.amber[200],
    gradient: gradients.queued,
  },
  processing: {
    bg: colors.semantic.info.light,
    text: colors.semantic.info.DEFAULT,
    border: '#bfdbfe',
    gradient: gradients.processing,
  },
  building: {
    bg: colors.husky[100],
    text: colors.husky[600],
    border: colors.husky[200],
    gradient: gradients.building,
  },
  ready: {
    bg: colors.semantic.success.light,
    text: colors.semantic.success.DEFAULT,
    border: '#bbf7d0',
    gradient: gradients.ready,
  },
  failed: {
    bg: colors.semantic.error.light,
    text: colors.semantic.error.DEFAULT,
    border: '#fecaca',
    gradient: gradients.failed,
  },
} as const;

// ============================================================================
// EXPORT ALL TOKENS
// ============================================================================

export const designTokens = {
  colors,
  gradients,
  typography,
  spacing,
  borderRadius,
  shadows,
  blur,
  backdrop,
  transitions,
  zIndex,
  breakpoints,
  components,
  animations,
  statusColors,
} as const;

export default designTokens;
