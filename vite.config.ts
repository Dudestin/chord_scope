import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs, so the build works under any path (GitHub Pages serves it from /<repo>/).
  base: './',
  plugins: [react()],
})
