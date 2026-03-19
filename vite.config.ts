import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Set base to your GitHub repo name for GitHub Pages deployment
// e.g. '/Schedule-Planner/' — update this to match your actual repo name
export default defineConfig({
  base: '/schedule-planner/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
