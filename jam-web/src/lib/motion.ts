/**
 * 모션 토큰 읽기 헬퍼.
 *
 * transitions.dev 스니펫은 CSS가 타이밍을 소유하고, JS는 그 값을 "읽어서"
 * 마운트/언마운트 시점만 맞춥니다. 그래서 duration을 JS에 하드코딩하지 않고
 * 항상 `:root`(globals.css)의 토큰에서 읽어옵니다 — 토큰을 조정하면 JS 쪽
 * 타이밍도 자동으로 따라옵니다.
 */

/** `--panel-close-dur` 같은 CSS 시간 토큰을 밀리초 숫자로 읽습니다. */
export function cssDurationMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  const value = parseFloat(raw)
  if (!Number.isFinite(value)) return fallback
  // `250ms` → 250 / `0.25s` → 250
  return raw.endsWith('ms') ? value : value * 1000
}

/** OS 수준에서 모션 축소를 요청한 사용자인지. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
