/**
 * 오버레이 레이어 합성 (티켓 20261103_1735) — Shape·Ribbon·3D가 같은 함수를 쓴다.
 * 레이어 그리기 함수는 가짜로 바꿔, 그리는 순서와 넘기는 스테이지 크기·위치 값만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasLike, OverlayLayerConfig } from '@/lib/asset-generator'

const calls: { kind: 'image' | 'text'; args: Record<string, unknown> }[] = []

vi.mock('@/lib/asset-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/asset-generator')>()
  return {
    ...actual,
    drawImageLayer: vi.fn((_ctx: unknown, args: Record<string, unknown>) => calls.push({ kind: 'image', args })),
    drawTextLayer: vi.fn((_ctx: unknown, args: Record<string, unknown>) => calls.push({ kind: 'text', args })),
  }
})

import { drawOverlayLayersOnto } from '../overlayStage'

const image = (id: string, url: string): OverlayLayerConfig => ({
  type: 'image',
  id,
  assetUrl: url,
  xPct: 30,
  yPct: 40,
  widthPct: 50,
  rotationDeg: 0,
  opacityPct: 100,
})

const text = (id: string, content: string): OverlayLayerConfig => ({
  type: 'text',
  id,
  content,
  font: { family: 'Pretendard', weight: 700 },
  sizePct: 8,
  letterSpacing: 0,
  lineHeight: 1.2,
  align: 'center',
  color: '#000000',
  xPct: 50,
  yPct: 50,
  rotationDeg: 0,
  opacityPct: 100,
} as OverlayLayerConfig)

describe('drawOverlayLayersOnto', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('배열의 뒤에서부터(아래 층부터) 그려 첫 레이어가 가장 위에 온다', () => {
    const assets = { 'a.png': {} as CanvasLike }
    drawOverlayLayersOnto({} as never, [text('t1', '위'), image('i1', 'a.png'), text('t2', '아래')], assets, 1152, 2048)
    expect(calls.map((c) => (c.kind === 'text' ? c.args.content : 'image'))).toEqual(['아래', 'image', '위'])
  })

  it('저장 크기를 스테이지 크기로 넘기고, 위치·크기는 레이어의 % 값을 그대로 넘긴다', () => {
    const assets = { 'a.png': {} as CanvasLike }
    drawOverlayLayersOnto({} as never, [image('i1', 'a.png'), text('t1', '글')], assets, 2048, 1152)
    for (const c of calls) {
      expect(c.args.stageWidth).toBe(2048)
      expect(c.args.stageHeight).toBe(1152)
    }
    const img = calls.find((c) => c.kind === 'image')!
    expect(img.args).toMatchObject({ xPct: 30, yPct: 40, widthPct: 50 })
    const txt = calls.find((c) => c.kind === 'text')!
    expect(txt.args).toMatchObject({ xPct: 50, yPct: 50, sizePct: 8 })
  })

  it('아직 불러오지 못한 이미지 레이어는 건너뛴다', () => {
    drawOverlayLayersOnto({} as never, [image('i1', 'missing.png'), text('t1', '글')], {}, 100, 100)
    expect(calls.map((c) => c.kind)).toEqual(['text'])
  })
})
