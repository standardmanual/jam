/**
 * 원을 따라 글자를 놓는 계산 (티켓 20261116_1435). 순수 모듈 — 그리는 일은 하지 않는다.
 * 그리는 쪽은 (x, y)로 옮기고 rotationDeg만큼 시계 방향으로 돌린 뒤,
 * 글자를 가로 가운데·기준선(alphabetic) 맞춤으로 원점에 그린다.
 */
export interface ArcTextInput {
  /** 글자별 폭. fontSize로 잰 값이고 좌표 단위는 cx·cy와 같다 */
  advances: number[]
  fontSize: number
  letterSpacingEm: number
  cx: number
  cy: number
  baselineRadius: number
  /** 글자 사이 각도를 재는 호의 반지름. 없으면 baselineRadius와 같다(글자 위치(x, y)는 baselineRadius로 정한다) */
  pathRadius?: number
  /** 12시가 0, 시계 방향이 + */
  centerDeg: number
  facing: 'outward' | 'inward'
  maxSpanDeg: number
}

interface ArcGlyph {
  index: number
  x: number
  y: number
  rotationDeg: number
}

export interface ArcTextLayout {
  fontSize: number
  scale: number
  shrunk: boolean
  spanDeg: number
  glyphs: ArcGlyph[]
}

const DEG = 180 / Math.PI

export function layoutArcText(input: ArcTextInput): ArcTextLayout | null {
  const { advances, fontSize, letterSpacingEm, cx, cy, baselineRadius: R, centerDeg, facing, maxSpanDeg } = input
  const P = input.pathRadius ?? R
  const positive = (n: number) => Number.isFinite(n) && n > 0
  if (!positive(R) || !positive(P) || !positive(fontSize) || !positive(maxSpanDeg)) return null
  if (advances.length === 0) return { fontSize, scale: 1, shrunk: false, spanDeg: 0, glyphs: [] }

  const gap0 = letterSpacingEm * fontSize
  const length0 = advances.reduce((s, a) => s + a, 0) + gap0 * (advances.length - 1)
  const span0 = (length0 / P) * DEG
  const shrunk = span0 > maxSpanDeg
  const scale = shrunk ? maxSpanDeg / span0 : 1

  const gap = gap0 * scale
  const length = length0 * scale
  let cursor = -length / 2
  const glyphs: ArcGlyph[] = advances.map((adv, index) => {
    const w = adv * scale
    const a = ((cursor + w / 2) / P) * DEG
    cursor += w + gap
    const theta = facing === 'outward' ? centerDeg + a : centerDeg - a
    const rad = theta / DEG
    return {
      index,
      x: cx + R * Math.sin(rad),
      y: cy - R * Math.cos(rad),
      rotationDeg: facing === 'outward' ? theta : theta - 180,
    }
  })
  return { fontSize: fontSize * scale, scale, shrunk, spanDeg: (length / P) * DEG, glyphs }
}
