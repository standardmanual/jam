import { GACHA } from './gachaTheme'
import { MIN_DRAW_RADIUS } from './gachaPhysics'

/**
 * 가차볼 캔버스 그리기 (티켓 20261127_2225) — 프로토타입 `drawBall()`을 옮겼다. 색은 `gachaTheme.ts`에서 읽는다.
 */

/** `#rrggbb`에 투명도를 줘 캔버스 색 문자열로 바꾼다 */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
}

/**
 * 가차볼: 전체가 투명한 유리구. 안에 넣은 배지가 비치고 공마다 아주 옅은 색만 테두리에 돈다.
 * `frosted`가 참이면 속이 비치지 않는 어두운 스모크 유리구로 그린다(안의 배지는 그리지 않는다).
 */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
  color: string,
  img: HTMLImageElement | null,
  frosted = false,
): void {
  // 막 생겨나는 순간처럼 반지름이 아주 작으면 그리지 않는다(음수 반지름은 그리기 오류를 내 애니메이션이 멈춘다)
  if (!(r > MIN_DRAW_RADIUS)) return
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = GACHA.ballGlass
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  if (frosted) {
    const smoke = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.04, 0, 0, r)
    smoke.addColorStop(0, GACHA.ballSmoke[0])
    smoke.addColorStop(0.35, GACHA.ballSmoke[1])
    smoke.addColorStop(0.8, GACHA.ballSmoke[2])
    smoke.addColorStop(1, GACHA.ballSmoke[3])
    ctx.fillStyle = smoke
    ctx.fillRect(-r, -r, 2 * r, 2 * r)
  }
  // 안에 든 배지(공과 함께 구른다). 그림 로드·CORS 실패면 그리지 않아 빈 투명구가 된다
  if (!frosted && img && img.complete && img.naturalWidth) {
    ctx.save()
    ctx.rotate(rot)
    ctx.globalAlpha = 0.95
    try {
      ctx.drawImage(img, -r * 0.62, -r * 0.62, r * 1.24, r * 1.24)
    } catch {
      // 그릴 수 없는 그림은 건너뛴다
    }
    ctx.restore()
  }
  const edge = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r)
  edge.addColorStop(0, GACHA.ballEdgeClear)
  edge.addColorStop(0.75, withAlpha(color, 0.1))
  edge.addColorStop(1, GACHA.ballEdgeRim)
  ctx.fillStyle = edge
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  ctx.beginPath()
  ctx.ellipse(r * 0.28, r * 0.6, r * 0.42, r * 0.14, -0.35, 0, Math.PI * 2)
  ctx.fillStyle = GACHA.ballShineLow
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(-r * 0.36, -r * 0.5, r * 0.3, r * 0.14, -0.6, 0, Math.PI * 2)
  ctx.fillStyle = GACHA.ballShineTop
  ctx.fill()
  ctx.beginPath()
  ctx.arc(-r * 0.62, -r * 0.18, r * 0.06, 0, Math.PI * 2)
  ctx.fillStyle = GACHA.ballShineDot
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.5, r - 0.6), 0, Math.PI * 2)
  ctx.strokeStyle = GACHA.ballRing
  ctx.lineWidth = 1.2
  ctx.stroke()
}
