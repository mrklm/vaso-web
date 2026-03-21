import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use relative paths for Electron, /vaso-web/ for GitHub Pages
const isElectron = process.env.ELECTRON === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: isElectron ? './' : '/vaso-web/',
})
