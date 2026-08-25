'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CloseIcon, InfoIcon } from './icons'
import { cssDurationMs, cssLengthPx } from '@/lib/motion'
import { useBottomOverlayReserved } from '@/lib/uiOverlay'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  /** 닫힘 트랜지션 진행 중 — DOM에는 남아 있고 `.is-open`만 떨어진 상태 */
  closing: boolean
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

/**
 * 하단 앵커의 기본 여백(px, safe-area 제외) — 플로팅 탭바(safe-area+16px, 높이 64px)와
 * 8px 간격을 둔 값. 하단 오버레이가 더 높이 점유하면 그 값 + 8px로 대체된다.
 */
const DEFAULT_BOTTOM_PX = 88

/**
 * 토스트와 아래 오버레이 사이 최소 간격(px) = `--toast-distance`(globals.css, 16px).
 *
 * 진입/퇴장 트랜지션 동안 `.t-toast`는 최종 위치보다 `--toast-distance`만큼 **아래**에
 * 그려진다(transitions.css). 간격이 그보다 작으면 애니메이션 250~350ms 동안 토스트가 아래
 * 버튼 위를 덮고, 그 사각형은 `pointer-events-auto`라 그 사이 탭이 버튼 대신 토스트
 * 디스미스로 먹힌다. 그래서 간격을 별도 상수로 두지 않고 같은 토큰을 그대로 읽어 쓴다.
 * 토큰은 정적이라 한 번만 읽어 캐시한다(렌더마다 스타일 재계산하지 않도록).
 */
const OVERLAY_GAP_FALLBACK_PX = 16
let cachedOverlayGapPx: number | null = null
function overlayGapPx(): number {
  if (cachedOverlayGapPx === null) {
    cachedOverlayGapPx = cssLengthPx('--toast-distance', OVERLAY_GAP_FALLBACK_PX)
  }
  return cachedOverlayGapPx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // 20260826_005: 컨테이너를 document.body로 포털링하기 위한 마운트 게이트(BottomSheet.tsx와 동일).
  // `document`는 클라이언트에만 있으므로 SSR·하이드레이션 렌더에서는 false를 돌려 아무것도 렌더하지
  // 않고, 하이드레이션이 끝난 뒤에만 true가 되어 포털을 만든다. useEffect+setState 대신
  // useSyncExternalStore를 쓰는 이유는 effect 안의 동기 setState가 react-hooks 규칙에 걸리기 때문.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )

  // 20260826_005: 하단을 점유하는 오버레이(바텀시트 등)가 신고한 점유 높이. 시트 하단 액션 버튼과
  // 토스트가 기하학적으로 포개져 버튼 탭이 토스트 디스미스로 먹히던 문제를 막는다.
  // 스냅샷이 아니라 구독인 이유: 이미 떠 있는 토스트(3초) 위로 시트가 열리는 역방향 케이스도
  // 방어해야 한다. 하단 앵커는 그대로이고 위치만 위로 밀려 올라가므로 튀어 보이지 않는다.
  // (오버레이 열림/닫힘은 드문 이벤트라 이 구독으로 인한 Provider 재렌더도 그만큼만 일어난다)
  const reservedBottom = useBottomOverlayReserved()

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
      {/*
        20260825_039: 토스트는 모달·바텀시트보다 위에 뜨는 최상위 피드백 레이어다(z-[60]).
        BottomSheet·Radix Dialog/Sheet 등은 document.body '맨 뒤'로 포털링되므로 같은 z-50에서는
        DOM 순서가 뒤인 오버레이가 이겨 토스트가 시트 뒤로 숨었다.
        (실제 회귀: 지도 → POI 캐러셀 → 드랍 픽업 실패 시 실패 사유가 보이지 않음)

        20260826_005: 그때의 z-[60]은 "앱 셸 div가 z-index:auto라 스태킹 컨텍스트를 만들지
        않는다"는, 주석에만 존재하는 불변식에 기대고 있었다 — 셸에 transform·filter·isolation·z-*를
        하나라도 붙이면 같은 버그가 조용히 재발한다. 컨테이너를 document.body로 포털링해 그 의존을
        없앤다. 이제 토스트와 BottomSheet는 **둘 다 body 직속 = 같은 루트 스태킹 컨텍스트**이므로
        DOM 순서와 무관하게 z 값(60 > 50)만으로 서열이 확정된다.
        NavigationLoader(z-[9999])도 body 직속이라 여전히 토스트보다 위다.

        컨테이너는 pointer-events-none이고 토스트가 없으면 높이 0이라, 항상 렌더돼 있어도
        아래 오버레이 조작을 막지 않는다.

        위치는 하단 앵커 하나뿐이다("행동이 일어난 곳 근처에서 위로 올라온다"). 기본값은 플로팅
        탭바 위 88px이고, 하단을 더 높이 점유하는 오버레이가 신고돼 있으면 그 위 --toast-distance
        만큼 띄운다 — 높이 실측은 오버레이 자신이 하므로 여기에는 footer 높이 매직 넘버가 없다.
      */}
      {mounted &&
        createPortal(
          <div
            className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
            style={{
              bottom: `calc(env(safe-area-inset-bottom) + ${Math.max(
                DEFAULT_BOTTOM_PX,
                reservedBottom + overlayGapPx()
              )}px)`,
            }}
          >
            {toasts.map((t) => (
              <ToastRow key={t.id} item={t} icon={iconMap[t.type]} onDismiss={() => dismiss(t.id)} />
            ))}
          </div>,
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
