import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * Optimized Vite Configuration for HuskyStudio Generated Apps
 *
 * Performance Optimizations (rolldown-vite):
 * - SWC for React transforms (20-70x faster than Babel)
 * - Oxc for minification (faster than esbuild, powered by Rolldown)
 * - Persistent cache for fast rebuilds
 * - Console logs removed for smaller bundles
 */
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',

  // Persistent cache for faster rebuilds
  // Use shared cache directory if VITE_CACHE_DIR is set (for build server optimization)
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',

  plugins: [
    react()
  ],

  build: {
    target: 'es2022', // Modern browsers - less transpilation needed

    // Minification handled by Oxc in rolldown-vite (faster than esbuild)
    minify: true,

    // Faster builds - skip compressed size calculation
    reportCompressedSize: false,

    // Reasonable chunk size warning
    chunkSizeWarningLimit: 1000,

    // No source maps in production
    sourcemap: false,

    // Enable CSS code splitting
    cssCodeSplit: true,

    // Optimized Rollup settings for faster builds
    rollupOptions: {
      output: {
        // Disable manual chunks - let Vite handle it automatically
        // This reduces chunk analysis overhead on limited CPU
      },
    },
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },

  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    // Remove console logs and debugger statements for smaller bundles
    drop: ['console', 'debugger'],
  },

  // Dev server configuration
  server: {
    hmr: true,
    open: false,
  },
})
