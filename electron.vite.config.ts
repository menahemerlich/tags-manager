import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    publicDir: resolve('src/renderer/public'),
    /** ברנדרר אין node:path — משתמשים ב-polyfill כדי ש-shared/pathUtils יעבוד ב-Vite. */
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        'node:path': resolve('node_modules/path-browserify'),
        path: resolve('node_modules/path-browserify')
      }
    },
    optimizeDeps: {
      include: ['path-browserify']
    },
    plugins: [react()]
  }
})
