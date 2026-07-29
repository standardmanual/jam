'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, InfoIcon } from './icons'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timerMap.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerMap.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, message, type }])
      const timer = setTimeout(() => dismiss(id), 3000)
      timerMap.current.set(id, timer)
    },
    [dismiss]
  )

  useEffect(() => {
    const map = timerMap.current
    return () => {
      map.forEach((t) => clearTimeout(t))
    }
  }, [])

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckIcon className="w-4 h-4" />,
    error: <CloseIcon className="w-4 h-4" />,
    info: <InfoIcon className="w-4 h-4" />,
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-4 py-3 rounded-[var(--radius-buttons)] bg-surface-inverse text-text-inverse text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] pointer-events-auto"
            onClick={() => dismiss(t.id)}
          >
            <span className="shrink-0 text-text-inverse/60">{iconMap[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
