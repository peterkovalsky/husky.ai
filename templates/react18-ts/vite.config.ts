import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * Optimized Vite Configuration for HuskyStudio Generated Apps
 *
 * Performance Optimizations:
 * - SWC instead of Babel (20-70x faster React transforms)
 * - esbuild for minification (10-100x faster than terser)
 * - Disabled code splitting for faster builds on limited CPU
 * - Console logs removed for smaller bundles
 */
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',

  plugins: [
    react()
  ],

  build: {
    target: 'es2020',

    // Use esbuild for all minification (much faster than terser/rollup)
    minify: 'esbuild',
    cssMinify: 'esbuild',

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
