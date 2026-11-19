import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

// `server-only`는 Next 번들러가 처리하는 표식이라 vitest에서는 비워 둔다
vi.mock('server-only', () => ({}))

import { extractBadgeColors, pickBadgeColors } from '../badgeColorExtract'

type Run = readonly [r: number, g: number, b: number, a: number, count: number]

function pixels(runs: Run[]): Uint8Array {
  const total = runs.reduce((sum, run) => sum + run[4], 0)
  const out = new Uint8Array(total * 4)
  let at = 0
  for (const [r, g, b, a, count] of runs) {
    for (let i = 0; i < count; i++) {
      out[at++] = r
      out[at++] = g
      out[at++] = b
      out[at++] = a
    }
  }
  return out
}

/** HSL → RGB(0~255). 시험 입력을 색상 각도로 쓰기 위한 보조 */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

const RED: [number, number, number] = [220, 40, 40]
const BLACK: [number, number, number] = [10, 10, 10]
const GRAY: [number, number, number] = [128, 128, 128]

describe('pickBadgeColors', () => {
  it('검은 외곽선·회색이 많아도 외곽선 색은 뽑지 않는다', () => {
    const colors = pickBadgeColors(pixels([[...BLACK, 255, 3000], [...GRAY, 255, 800], [...RED, 255, 200]]))
    expect(colors).toEqual(['#dc2828'])
  })

  it('색이 하나뿐이면 1개만 돌려준다', () => {
    expect(pickBadgeColors(pixels([[...RED, 255, 50]]))).toHaveLength(1)
  })

  it('흑백·투명뿐이면 빈 배열이다', () => {
    const colors = pickBadgeColors(
      pixels([[...BLACK, 255, 100], [...GRAY, 255, 100], [255, 255, 255, 255, 100], [...RED, 100, 100]]),
    )
    expect(colors).toEqual([])
  })

  it('색상 간격 40° 미만인 색은 한 색으로 합쳐지고, 간격이 벌어지면 따로 나온다', () => {
    const near = pickBadgeColors(pixels([[...hsl(10, 0.8, 0.5), 255, 100], [...hsl(30, 0.8, 0.5), 255, 60]]))
    expect(near).toHaveLength(1)
    const far = pickBadgeColors(pixels([[...hsl(10, 0.8, 0.5), 255, 100], [...hsl(90, 0.8, 0.5), 255, 60]]))
    expect(far).toHaveLength(2)
  })

  it('같은 입력에는 같은 결과를 돌려준다', () => {
    const input = pixels([
      [...hsl(0, 0.8, 0.5), 255, 70],
      [...hsl(100, 0.7, 0.4), 255, 70],
      [...hsl(200, 0.6, 0.6), 255, 70],
    ])
    expect(pickBadgeColors(input)).toEqual(pickBadgeColors(input))
  })

  it('최대 3개, 밝기 높은 순으로 돌려준다', () => {
    const input = pixels([
      [...hsl(0, 0.8, 0.35), 255, 90],
      [...hsl(90, 0.8, 0.7), 255, 80],
      [...hsl(180, 0.8, 0.5), 255, 70],
      [...hsl(270, 0.8, 0.45), 255, 60],
    ])
    const colors = pickBadgeColors(input)
    expect(colors).toHaveLength(3)
    // 점수 상위 3색(0°·90°·180°)을 명도 0.7 > 0.5 > 0.35 순으로 늘어놓는다
    expect(colors).toEqual([
      expect.stringMatching(/^#/),
      expect.stringMatching(/^#/),
      expect.stringMatching(/^#/),
    ])
    const lightness = colors.map((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
    })
    expect(lightness[0]).toBeGreaterThan(lightness[1])
    expect(lightness[1]).toBeGreaterThan(lightness[2])
  })
})

describe('extractBadgeColors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('정적 주소의 파일이 없으면 예외 없이 null이다', async () => {
    await expect(extractBadgeColors('/badges/__없는-파일__.png')).resolves.toBeNull()
  })

  it('public 밖을 가리키는 주소는 null이다', async () => {
    await expect(extractBadgeColors('/../package.json')).resolves.toBeNull()
  })

  it('빈 주소·네트워크 오류·이미지가 아닌 응답은 null이다', async () => {
    await expect(extractBadgeColors('')).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await expect(extractBadgeColors('https://example.com/a.png')).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not an image', { status: 200 })))
    await expect(extractBadgeColors('https://example.com/a.png')).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 404 })))
    await expect(extractBadgeColors('https://example.com/a.png')).resolves.toBeNull()
  })

  it('이미지를 받으면 대표색을 돌려주고, 색이 없으면 빈 배열이다', async () => {
    const make = (rgb: [number, number, number]) =>
      sharp({ create: { width: 16, height: 16, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
        .png()
        .toBuffer()
    const red = await make(RED)
    const gray = await make(GRAY)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(red), { status: 200 })))
    await expect(extractBadgeColors('https://example.com/red.png')).resolves.toEqual(['#dc2828'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(gray), { status: 200 })))
    await expect(extractBadgeColors('https://example.com/gray.png')).resolves.toEqual([])
  })
})
