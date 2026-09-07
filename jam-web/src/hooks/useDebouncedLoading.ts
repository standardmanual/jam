import { useEffect, useRef, useState } from 'react'

export interface DebouncedLoadingOptions {
  /** 이 시간 안에 로딩이 끝나면 로더를 아예 띄우지 않는다 (ms) */
  showDelayMs?: number
  /** flash 방지 — 일단 뜬 뒤엔 최소 이 시간만큼은 표시 (ms) */
  minVisibleMs?: number
  /** 오류 등으로 로딩이 비정상적으로 오래 걸릴 때의 강제 숨김 (ms) */
  maxVisibleMs?: number
}

const DEFAULT_SHOW_DELAY_MS = 1000
const DEFAULT_MIN_VISIBLE_MS = 400
const DEFAULT_MAX_VISIBLE_MS = 8000

/**
 * `NavigationLoader`의 "지연 후 표시 + 최소 표시 시간 + 최대 표시 시간" 디바운스 정책을
 * 재사용 가능한 훅으로 추출한 것 (티켓 20260908_0544).
 *
 * `isLoading`이 `showDelayMs` 안에 `false`로 돌아오면 로더를 한 번도 보여주지 않고,
 * 일단 보여준 뒤에는 `minVisibleMs`를 채운 뒤에만 숨긴다(깜빡임 방지).
 * `maxVisibleMs`는 로딩이 비정상적으로 오래 걸릴 때 화면이 영원히 로더에 갇히지
 * 않도록 하는 안전장치다.
 *
 * 반환값(`visible`)은 "로더를 보여줘야 하는가"만 판단한다 — 실제 데이터가 이미
 * 준비된 경우(ready/error 등)는 호출부에서 그 상태를 우선 확인해 즉시 실제 콘텐츠를
 * 보여주고, 이 값은 오직 "아직 아무것도 준비되지 않은 대기 구간"에만 참조하는 것을
 * 권장한다 — 그래야 minVisibleMs가 실제로 준비된 콘텐츠 노출을 인위적으로 늦추지 않는다.
 */
export function useDebouncedLoading(
  isLoading: boolean,
  options: DebouncedLoadingOptions = {},
): boolean {
  const {
    showDelayMs = DEFAULT_SHOW_DELAY_MS,
    minVisibleMs = DEFAULT_MIN_VISIBLE_MS,
    maxVisibleMs = DEFAULT_MAX_VISIBLE_MS,
  } = options

  const [visible, setVisible] = useState(false)
  const phaseRef = useRef<'hidden' | 'pending' | 'showing'>('hidden')
  const showTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    if (isLoading) {
      clearTimer()
      phaseRef.current = 'pending'
      timerRef.current = setTimeout(() => {
        phaseRef.current = 'showing'
        showTimeRef.current = Date.now()
        setVisible(true)
        // 안전장치: 표시된 뒤 maxVisibleMs가 더 지나면 강제 숨김
        timerRef.current = setTimeout(() => {
          phaseRef.current = 'hidden'
          setVisible(false)
        }, maxVisibleMs)
      }, showDelayMs)
    } else if (phaseRef.current === 'pending') {
      // showDelayMs가 지나기 전에 로딩이 끝남 — 로더를 한 번도 보여주지 않고 종료
      clearTimer()
      phaseRef.current = 'hidden'
    } else if (phaseRef.current === 'showing') {
      clearTimer()
      const elapsed = Date.now() - showTimeRef.current
      const delay = Math.max(0, minVisibleMs - elapsed)
      timerRef.current = setTimeout(() => {
        phaseRef.current = 'hidden'
        setVisible(false)
      }, delay)
    }

    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  return visible
}
