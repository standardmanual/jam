'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CloseIcon, InfoIcon } from './icons'
import { cssDurationMs } from '@/lib/motion'
import { isBottomOverlayOpen } from '@/lib/uiOverlay'

type ToastType = 'success' | 'error' | 'info'

/** 토스트가 붙는 화면 모서리. 토스트가 뜨는 순간 확정되고 사라질 때까지 바뀌지 않는다. */
type ToastAnchor = 'bottom' | 'top'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  /** 닫힘 트랜지션 진행 중 — DOM에는 남아 있고 `.is-open`만 떨어진 상태 */
  closing: boolean
  anchor: ToastAnchor
}

/** 마운트 게이트 전용 — 구독할 외부 스토어가 없으므로 아무것도 하지 않는 subscribe. */
const subscribeNoop = () => () => {}

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

/** 상·하단 두 앵커 컨테이너가 공유하는 클래스 — 위치(top/bottom)만 style로 달리 준다. */
const CONTAINER_CLASS =
  'fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // 20260826_001: 컨테이너를 document.body로 포털링하기 위한 마운트 게이트(BottomSheet.tsx와 동일).
  // `document`는 클라이언트에만 있으므로 SSR·하이드레이션 렌더에서는 false를 돌려 아무것도 렌더하지
  // 않고, 하이드레이션이 끝난 뒤에만 true가 되어 포털을 만든다. useEffect+setState 대신
  // useSyncExternalStore를 쓰는 이유는 effect 안의 동기 setState가 react-hooks 규칙에 걸리기 때문.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )

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
      // 20260826_001: 앵커는 "뜨는 순간"에 확정한다. 하단 오버레이(바텀시트)가 떠 있으면
      // 시트 footer 버튼과 겹치지 않도록 상단으로 보낸다. 구독으로 실시간 반영하지 않는 이유는
      // uiOverlay.ts의 `isBottomOverlayOpen` 주석 참고(살아 있는 토스트의 순간이동 방지).
      const anchor: ToastAnchor = isBottomOverlayOpen() ? 'top' : 'bottom'
      setToasts((prev) => [...prev, { id, message, type, closing: false, anchor }])
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

  const rows = (anchor: ToastAnchor) =>
    toasts
      .filter((t) => t.anchor === anchor)
      .map((t) => (
        <ToastRow key={t.id} item={t} icon={iconMap[t.type]} onDismiss={() => dismiss(t.id)} />
      ))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/*
        20260825_039: 토스트는 모달·바텀시트보다 위에 뜨는 최상위 피드백 레이어다(z-[60]).
        BottomSheet·Radix Dialog/Sheet 등은 document.body '맨 뒤'로 포털링되므로 같은 z-50에서는
        DOM 순서가 뒤인 오버레이가 이겨 토스트가 시트 뒤로 숨었다.
        (실제 회귀: 지도 → POI 캐러셀 → 드랍 픽업 실패 시 실패 사유가 보이지 않음)

        20260826_001: 그때의 z-[60]은 "앱 셸 div가 z-index:auto라 스태킹 컨텍스트를 만들지
        않는다"는, 주석에만 존재하는 불변식에 기대고 있었다 — 셸에 transform·filter·isolation·z-*를
        하나라도 붙이면 같은 버그가 조용히 재발한다. 컨테이너를 document.body로 포털링해 그 의존을
        없앤다. 이제 토스트와 BottomSheet는 **둘 다 body 직속 = 같은 루트 스태킹 컨텍스트**이므로
        DOM 순서와 무관하게 z 값(60 > 50)만으로 서열이 확정된다.
        NavigationLoader(z-[9999])도 body 직속이라 여전히 토스트보다 위다.

        컨테이너는 pointer-events-none이고 토스트가 없으면 높이 0이라, 항상 렌더돼 있어도
        아래 오버레이 조작을 막지 않는다.
      */}
      {mounted &&
        createPortal(
          <>
            {/* 상단 앵커 — 하단 오버레이가 떠 있는 동안 뜬 토스트. TopNav(safe-area-inset-top +
                56px) 바로 아래 8px. --toast-distance를 음수로 덮어써 진입 모션이 "위에서
                내려온다"가 되게 한다(하단 앵커의 "아래에서 올라온다"와 대칭). */}
            <div
              className={CONTAINER_CLASS}
              style={
                {
                  top: 'calc(env(safe-area-inset-top) + 56px + 8px)',
                  '--toast-distance': '-16px',
                } as CSSProperties
              }
            >
              {rows('top')}
            </div>

            {/* 하단 앵커(기본) — 88px은 플로팅 탭바(safe-area+16px+64px) 위 여백 */}
            <div className={CONTAINER_CLASS} style={{ bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}>
              {rows('bottom')}
            </div>
          </>,
          document.body
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
