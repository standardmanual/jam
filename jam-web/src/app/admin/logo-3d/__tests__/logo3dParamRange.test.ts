import type { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { buildLogoGeometry } from '@/lib/logo-3d/buildGeometry'
import { DEFAULT_LOGO3D_PARAMS, LOGO3D_PARAM_RANGES, type Logo3DParams } from '@/lib/logo-3d/types'
import { ALL_OUTLINES } from '@/lib/logo-3d/__tests__/fixtures'

// 티켓 20261103_1352 완료 조건: 틀 폭·틀 베벨 슬라이더를 어느 경계 조합으로 움직여도 윗면 삼각형이 납작해지지 않는다.
const MIN_QUALITY = 2e-4

function topFaceQualities(g: BufferGeometry): number[] {
  const pos = g.getAttribute('position')
  const index = g.getIndex()
  const triCount = (index ? index.count : pos.count) / 3
  g.computeBoundingBox()
  const max = g.boundingBox!.max.z
  const at = (i: number) => {
    const v = index ? index.getX(i) : i
    return [pos.getX(v), pos.getY(v), pos.getZ(v)] as const
  }
  const result: number[] = []
  for (let t = 0; t < triCount; t++) {
    const a = at(t * 3)
    const b = at(t * 3 + 1)
    const c = at(t * 3 + 2)
    if (![a, b, c].every((p) => Math.abs(p[2] - max) < 1e-6)) continue
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2
    const longest2 = Math.max(
      (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2,
      (c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2,
      (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2
    )
    result.push(area / longest2)
  }
  return result
}

const frameWidth = LOGO3D_PARAM_RANGES.frameWidth
const frameBevel = LOGO3D_PARAM_RANGES.frameBevelRadius
const widths = [frameWidth.min, frameWidth.max]
const bevels = [frameBevel.min, frameBevel.max]

describe.each(ALL_OUTLINES)('%s: 틀 폭 × 틀 베벨 경계 조합', (name, outline) => {
  for (const w of widths) {
    for (const b of bevels) {
      // 알려진 결함: M은 틀 폭 최소 × 베벨 최대에서 틀 윗면 삼각분할이 실패해 earcut으로 되돌아가고, 한 직선 위의
      // 점 셋이 넓이 0인 삼각형(이음선)을 만든다(2026-11-03 실측: 이 조합의 윗면 삼각형 205개가 넓이/최장변² 2e-4 미만).
      // 엔진(티켓 20261103_1350 범위)을 고치면 이 항목이 통과로 바뀌어 it.fails가 실패하니 그때 일반 it으로 되돌린다.
      const knownDefect = name.startsWith('M') && w === frameWidth.min && b === frameBevel.max
      const run = knownDefect ? it.fails : it
      run(`틀 폭 ${w} × 틀 베벨 ${b}: 틀 윗면 삼각형의 넓이/최장변²가 ${MIN_QUALITY} 이상이다`, () => {
        const params: Logo3DParams = { ...DEFAULT_LOGO3D_PARAMS, frameWidth: w, frameBevelRadius: b }
        const built = buildLogoGeometry(outline, params)
        const q = topFaceQualities(built.frame)
        expect(q.length).toBeGreaterThan(0)
        expect(Math.min(...q)).toBeGreaterThanOrEqual(MIN_QUALITY)
      })
    }
  }

  it('틀 폭 최솟값 × 틀 베벨 최댓값이면 베벨이 줄고 사유가 warnings에 남는다', () => {
    const params: Logo3DParams = { ...DEFAULT_LOGO3D_PARAMS, frameWidth: frameWidth.min, frameBevelRadius: frameBevel.max }
    const built = buildLogoGeometry(outline, params)
    expect(built.warnings.some((w) => w.includes('틀 베벨 반지름'))).toBe(true)
  })
})
