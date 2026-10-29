import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  // Pre-empaqueta todas las dependencias al arrancar. Sin esto, la primera vez
  // Vite las descubre durante la navegacion, las re-optimiza y recarga la pagina,
  // lo que puede dejar la pestana en blanco a mitad de uso.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'framer-motion',
      'lucide-react',
      'zustand',
      'clsx',
      'tailwind-merge',
      'jspdf',
      'jspdf-autotable',
      'write-excel-file/browser',
    ],
  },
  server: {
    port: 5173,
    open: false,
  },
})