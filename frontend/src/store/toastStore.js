import { create } from 'zustand'
import { cryptoId } from '@/lib/format'

let seq = 0

export const useToastStore = create((set, get) => ({
  toasts: [],

  push: ({ title, description, tone = 'mint', icon, duration = 4200 }) => {
    const id = cryptoId('T')
    const toast = { id, title, description, tone, icon, seq: ++seq }
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }))
    if (duration) {
      setTimeout(() => get().dismiss(id), duration)
    }
    return id
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  mint: (title, description, icon) => useToastStore.getState().push({ title, description, tone: 'mint', icon }),
  pastel: (title, description, icon) => useToastStore.getState().push({ title, description, tone: 'pastel', icon }),
  danger: (title, description, icon) => useToastStore.getState().push({ title, description, tone: 'danger', icon }),
  info: (title, description, icon) => useToastStore.getState().push({ title, description, tone: 'info', icon }),
}