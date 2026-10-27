/**
 * JAM 2.0 묶음 진행 막대 (티켓 20261026_2028 3회차)
 *
 * 끝남·진행·남음을 한 줄에 이어 붙인 SVG다. `rect`의 `x`·`width`를 `%` 속성으로 넣어 인라인 `style` 없이 위치를 잡는다.
 */
import type { BundleBar as BundleBarRatio } from '@/lib/admin/devBoard/view'

export function BundleBar({ ratio, label }: { ratio: BundleBarRatio; label: string }) {
  const activeX = ratio.done
  const remainingX = Math.round((ratio.done + ratio.active) * 100) / 100
  return (
    <svg role="img" aria-label={label} className="h-3 w-full" data-bundle-bar="" preserveAspectRatio="none">
      <rect x="0%" y="0" width="100%" height="12" rx="2" className="fill-slate-100" />
      <rect data-part="done" x="0%" y="0" width={`${ratio.done}%`} height="12" className="fill-emerald-600" />
      <rect data-part="active" x={`${activeX}%`} y="0" width={`${ratio.active}%`} height="12" className="fill-amber-500" />
      <rect data-part="remaining" x={`${remainingX}%`} y="0" width={`${ratio.remaining}%`} height="12" className="fill-slate-300" />
    </svg>
  )
}
