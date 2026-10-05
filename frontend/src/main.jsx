import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from '@/context/ThemeContext'
import ToastHost from '@/components/ui/ToastHost'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
        <ToastHost />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)