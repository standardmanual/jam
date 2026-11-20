/**
 * 박스 모양 마스크·시드 물결 (티켓 20261120_2144)
 *
 * 확인하는 것: 같은 시드는 같은 물결 경로·다른 시드는 다른 경로, 물결 22마디·높낮이 범위(방향별), 마스크가 모양·방향마다 비어 있지 않다,
 * 돌출의 바깥 여백, 시드 없는 물결은 라운드로 대신한다, 소스에 `Math.random`·hex가 없다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/boxShape.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  BOX_ORIENTATIONS,
  BOX_SHAPES,
  ITEM_BOX,
  WAVE_VIEWBOX,
  boxProtrusion,
  buildBoxMask,
  buildWaveLobes,
  buildWaveMaskImage,
  buildWavePath,
  createRng,
  hashSeed,
  resolveBoxShape,
} from '../boxShape'
import { FEED_BOX } from '../feedConstants'

describe('시드 → 난수열', () => {
  it('같은 시드는 같은 값을 같은 순서로 낸다', () => {
    const a = createRng('card-1')
    const b = createRng('card-1')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('다른 시드는 다른 열을 낸다', () => {
    expect(createRng('card-1')()).not.toBe(createRng('card-2')())
  })

  it('값은 [0, 1) 범위이고 숫자 시드 0도 쓸 수 있다', () => {
    const rng = createRng(0)
    for (let i = 0; i < 100; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    expect(hashSeed(0)).toBe(hashSeed('0'))
  })
})

describe('buildWavePath — 시드 물결', () => {
  const { width, height } = WAVE_VIEWBOX.image

  it('같은 시드·같은 크기는 같은 경로다', () => {
    expect(buildWavePath('seed-a', width, height)).toBe(buildWavePath('seed-a', width, height))
  })

  it('다른 시드는 다른 경로다', () => {
    expect(buildWavePath('seed-a', width, height)).not.toBe(buildWavePath('seed-b', width, height))
  })

  it('경로는 M으로 시작해 Z로 닫히고 곡선 마디가 22개다', () => {
    const d = buildWavePath('seed-a', width, height)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.match(/Q/g)).toHaveLength(FEED_BOX.waveCount)
    expect(FEED_BOX.waveCount).toBe(22)
  })

  it.each(['seed-a', 'seed-b', 'card-123', 7])('시드 %s: 마디가 22개이고 높낮이가 12~22px 안에 있다', (seed) => {
    const lobes = buildWaveLobes(seed, width, height)
    expect(lobes).toHaveLength(22)
    for (const { depth } of lobes) {
      expect(depth).toBeGreaterThanOrEqual(FEED_BOX.waveAmplitude.min)
      expect(depth).toBeLessThanOrEqual(FEED_BOX.waveAmplitude.max)
    }
  })

  it('마디마다 깊이와 간격(너비)이 조금씩 다르다', () => {
    const lobes = buildWaveLobes('seed-a', width, height)
    expect(new Set(lobes.map((l) => l.depth)).size).toBeGreaterThan(10)
    const topWidths = lobes.filter((l) => l.side === 'top').map((l) => Math.round(l.to[0] - l.from[0]))
    expect(new Set(topWidths).size).toBeGreaterThan(1)
  })

  it('마디가 둘레를 끊김 없이 이어 한 바퀴 돈다(앞 마디 끝 = 다음 마디 시작, 마지막 끝 = 처음 시작)', () => {
    const lobes = buildWaveLobes('seed-a', width, height)
    lobes.forEach((lobe, i) => {
      const next = lobes[(i + 1) % lobes.length]
      expect(lobe.to).toEqual(next.from)
    })
  })

  it('네 변 모두에 마디가 있다', () => {
    const sides = new Set(buildWaveLobes('seed-a', width, height).map((l) => l.side))
    expect(sides).toEqual(new Set(['top', 'right', 'bottom', 'left']))
  })

  it('마디의 몸통 좌표가 viewBox 안에 있다(부푼 높이가 최대 높낮이 이하)', () => {
    for (const orientation of BOX_ORIENTATIONS) {
      const { width: w, height: h } = WAVE_VIEWBOX[orientation]
      const inset = orientation === 'item' ? ITEM_BOX.waveAmplitude.max : FEED_BOX.waveAmplitude.max
      for (const lobe of buildWaveLobes('seed-a', w, h, orientation === 'item' ? ITEM_BOX.waveAmplitude : undefined)) {
        for (const [x, y] of [lobe.from, lobe.to]) {
          expect(x).toBeGreaterThanOrEqual(inset)
          expect(x).toBeLessThanOrEqual(w - inset)
          expect(y).toBeGreaterThanOrEqual(inset)
          expect(y).toBeLessThanOrEqual(h - inset)
        }
      }
    }
  })

  it('item 방향은 줄인 높낮이(6~11px)를 쓴다', () => {
    const { width: w, height: h } = WAVE_VIEWBOX.item
    for (const { depth } of buildWaveLobes('seed-a', w, h, ITEM_BOX.waveAmplitude)) {
      expect(depth).toBeGreaterThanOrEqual(ITEM_BOX.waveAmplitude.min)
      expect(depth).toBeLessThanOrEqual(ITEM_BOX.waveAmplitude.max)
    }
  })
})

describe('buildBoxMask — 모양 × 방향', () => {
  const MASKED = BOX_SHAPES.filter((s) => s !== 'round')

  it('라운드는 마스크가 없다(모서리 클래스로 그린다)', () => {
    for (const orientation of BOX_ORIENTATIONS) expect(buildBoxMask('round', orientation)).toBeNull()
  })

  it.each(MASKED.flatMap((shape) => BOX_ORIENTATIONS.map((orientation) => [shape, orientation] as const)))(
    '%s × %s: 마스크 층이 있고 비어 있지 않다',
    (shape, orientation) => {
      const mask = buildBoxMask(shape, orientation, 'seed-a')
      expect(mask).not.toBeNull()
      expect(mask!.layers.length).toBeGreaterThan(0)
      for (const layer of mask!.layers) {
        expect(layer.image.length).toBeGreaterThan(0)
        expect(layer.size.length).toBeGreaterThan(0)
        expect(layer.position.length).toBeGreaterThan(0)
      }
    },
  )

  it('티켓: 텍스트 박스는 양쪽 변 홈 2개씩(지름 56), 이미지 마스크는 위·아래 변 2개씩(지름 40)', () => {
    const text = buildBoxMask('ticket', 'text')!
    expect(text.composite).toBe('intersect')
    expect(text.layers).toHaveLength(4)
    expect(text.layers[0].image).toContain('transparent 28px')
    expect(text.layers.every((l) => /at (0%|100%) /.test(l.image))).toBe(true)

    const image = buildBoxMask('ticket', 'image')!
    expect(image.layers).toHaveLength(4)
    expect(image.layers[0].image).toContain('transparent 20px')
    expect(image.layers.every((l) => /at [\d.]+% (0%|100%),/.test(l.image))).toBe(true)
  })

  it('우표: 이미지 마스크는 양쪽 변 홈 5개씩(지름 20), 텍스트 박스는 위·아래 변 홈(지름 24)', () => {
    const image = buildBoxMask('stamp', 'image')!
    expect(image.layers).toHaveLength(10)
    expect(image.layers[0].image).toContain('transparent 10px')
    const text = buildBoxMask('stamp', 'text')!
    expect(text.layers[0].image).toContain('transparent 12px')
    expect(text.composite).toBe('intersect')
  })

  it('반원 돌출은 층을 합치고(add) 반지름 값이 마스크에 들어간다', () => {
    expect(buildBoxMask('bump', 'item')!.composite).toBe('add')
    expect(buildBoxMask('bump', 'item')!.layers.some((l) => l.image.includes('black 28px'))).toBe(true)
    expect(buildBoxMask('bump', 'image')!.layers.some((l) => l.image.includes('black 52px'))).toBe(true)
  })

  it('물결은 같은 시드면 같은 마스크, 다른 시드면 다른 마스크다', () => {
    expect(buildBoxMask('wave', 'image', 's1')).toEqual(buildBoxMask('wave', 'image', 's1'))
    expect(buildBoxMask('wave', 'image', 's1')).not.toEqual(buildBoxMask('wave', 'image', 's2'))
    expect(buildWaveMaskImage('s1', 'text')).toMatch(/^url\("data:image\/svg\+xml,/)
  })

  it('마스크 문자열에 hex 색이 없다(black·transparent 키워드만)', () => {
    for (const shape of MASKED) {
      for (const orientation of BOX_ORIENTATIONS) {
        const mask = buildBoxMask(shape, orientation, 'seed-a')!
        for (const layer of mask.layers) {
          // 물결 층은 URL 인코딩된 SVG라 풀어서 본다(그라데이션 층의 `%`는 인코딩이 아니라 풀지 않는다).
          const text = layer.image.startsWith('url(') ? decodeURIComponent(layer.image) : layer.image
          expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}/)
        }
      }
    }
  })
})

describe('시드 없는 물결 → 라운드', () => {
  it('시드가 없거나 빈 문자열이면 라운드로 대신하고 마스크가 없다', () => {
    expect(resolveBoxShape('wave')).toBe('round')
    expect(resolveBoxShape('wave', '')).toBe('round')
    expect(buildBoxMask('wave', 'text')).toBeNull()
  })

  it('시드 0과 다른 모양은 그대로 쓴다', () => {
    expect(resolveBoxShape('wave', 0)).toBe('wave')
    expect(resolveBoxShape('ticket')).toBe('ticket')
  })
})

describe('boxProtrusion — 반원 돌출의 바깥 여백', () => {
  it('돌출이 아닌 모양은 여백이 0이다', () => {
    for (const shape of BOX_SHAPES.filter((s) => s !== 'bump')) {
      for (const orientation of BOX_ORIENTATIONS) {
        expect(boxProtrusion(shape, orientation)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
      }
    }
  })

  it('이미지 마스크는 양쪽으로 52, 아이템 배지 박스는 위·아래로 28이다', () => {
    expect(boxProtrusion('bump', 'image')).toEqual({ top: 0, right: 52, bottom: 0, left: 52 })
    expect(boxProtrusion('bump', 'item')).toEqual({ top: 28, right: 0, bottom: 28, left: 0 })
  })

  it('텍스트 박스는 양쪽으로 28이다(제안 값)', () => {
    expect(boxProtrusion('bump', 'text')).toEqual({ top: 0, right: 28, bottom: 0, left: 28 })
  })
})

describe('boxShape.ts 소스', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/lib/today/boxShape.ts'), 'utf8')

  it('Math.random과 #hex 색 리터럴이 없다', () => {
    expect(source).not.toContain('Math.random')
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
