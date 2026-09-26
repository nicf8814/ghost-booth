import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built app works when served from a subpath, e.g.
  // GitHub Pages at https://<user>.github.io/ghost-booth/, not just at a
  // domain root.
  base: './',
  plugins: [react()],
})
