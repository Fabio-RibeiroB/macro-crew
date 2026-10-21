import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { checkStatic } from './scripts/check-static.mjs'

let buildOutput = ''
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 8173,
    allowedHosts: ['finstats.fabio.org.uk'],
  },
  plugins: [
    // React renders the application; Tailwind supplies the chart component utilities.
    {
      name: 'finstats-static-boundary',
      apply: 'build',
      configResolved(config) { buildOutput = path.resolve(config.root, config.build.outDir) },
      buildStart() { checkStatic(path.resolve('public'), true) },
      closeBundle() { checkStatic(buildOutput) },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})


