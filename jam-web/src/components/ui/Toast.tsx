'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, InfoIcon } from './icons'
import { cssDurationMs } from '@/lib/motion'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  /** 닫힘 트랜지션 진행 중 — DOM에는 남아 있고 `.is-open`만 떨어진 상태 */
  closing: boolean
}

/**
 * 토스트 한 줄. transitions.dev `22-toast.md`의 `.t-toast` / `.is-open` 훅을
 * 사용한다. 마운트 직후 다음 프레임에 `.is-open`을 붙여야 닫힌 상태(아래 +
 * 블러 + scale)에서 트랜지션이 발화한다.
 */
function ToastRow({
  item,
  icon,
  onDismiss,
}: {
  item: ToastItem
  icon: React.ReactNode
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const isOpen = open && !item.closing

  return (
    <div
      className={[
        't-toast',
        isOpen ? 'is-open' : '',
        // 20260816_012: 보더 제거 — 흰 토스트가 다크 배경 위에서 대비만으로 충분히 구분됨
        'flex items-center gap-2 px-4 py-3 rounded-[var(--radius-buttons)] bg-surface-inverse text-text-inverse text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] pointer-events-auto',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onDismiss}
    >
      <span className="shrink-0 text-text-inverse/60">{icon}</span>
      <span>{item.message}</span>
    </div>
  )
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // 닫을 때 곧바로 언마운트하면 닫힘 트랜지션이 보이지 않으므로,
  // closing 플래그로 `.is-open`만 떼고 --toast-close 후에 제거한다.
  const dismiss = useCallback((id: string) => {
    const timer = timerMap.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerMap.current.delete(id)
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)))
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timerMap.current.delete(`${id}:remove`)
    }, cssDurationMs('--toast-close', 250))
    timerMap.current.set(`${id}:remove`, removeTimer)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, message, type, closing: false }])
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
          <ToastRow key={t.id} item={t} icon={iconMap[t.type]} onDismiss={() => dismiss(t.id)} />
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
