/**
 * 승인 전 카드 미리보기가 이미지를 바로 그리는 연결 (티켓 20261101_2149)
 *
 * 훅(`useDraftImagePreview`)을 가짜로 바꿔 «컴포넌트가 어떤 그리기 요청을 넘기는지»와 «돌려받은 상태를 어떻게 보이는지»를 서버 렌더로 확인한다.
 * 훅 안쪽(캐시·순차·지연)은 `useDraftImagePreview.test.ts`가 맡는다.
 *
 * 확인하는 것: 저장된 이미지가 있거나 `preset_id`가 없거나 제작 대상 상태(승인됨 이후)면 요청이 비어 렌더를 부르지 않는다 / 요청의 시드는 항목 ID의 고정 시드 /
 * 그리는 중·다 그림·임시 색·실패 때의 안내 문구 / 그려진 주소가 이미지 칸에 들어가고 저장 API는 부르지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { DraftImageRequest, DraftImageSnapshot } from '../useDraftImagePreview'

const post = vi.fn()
vi.mock('../imageClient', () => ({ postItemImage: (...a: unknown[]) => post(...a) }))

let snapshot: DraftImageSnapshot = new Map()
const hook = vi.fn((requests: readonly DraftImageRequest[]) => {
  void requests
  return snapshot
})
vi.mock('../useDraftImagePreview', () => ({ useDraftImagePreview: (r: readonly DraftImageRequest[]) => hook(r) }))

import {
  OpsCardPreview,
  PREVIEW_IMAGE_DRAWING_TEXT,
  PREVIEW_IMAGE_DRAWN_TEXT,
  PREVIEW_IMAGE_NEEDED_TEXT,
  PREVIEW_IMAGE_PENDING_TEXT,
  PREVIEW_IMAGE_TEMP_COLOR_TEXT,
} from '../OpsCardPreview'
import { PREVIEW_NEUTRAL_BG, stableImageSeed } from '@/lib/admin/opsInbox/imageSpec'

const html = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

const SPEC = { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } }

function card(over: { original?: Record<string, unknown>; status?: string } = {}) {
  return {
    id: 'item-1',
    kind: 'home_feed_card',
    status: over.status ?? 'reviewing',
    original: { shape: 'hero', exposure_tags: ['all'], copy: { title: '우산 챙겨 달리기' }, image_spec: SPEC, ...over.original } as never,
    edited: null,
  }
}

const lastRequests = (): DraftImageRequest[] => hook.mock.calls.at(-1)?.[0] as DraftImageRequest[]

beforeEach(() => {
  snapshot = new Map()
  hook.mockClear()
  post.mockReset()
})

describe('OpsCardPreview 승인 전 이미지 바로 그리기', () => {
  it('저장된 이미지가 없고 preset_id가 있으면 항목 ID의 고정 시드로 한 건을 요청한다', () => {
    html(<OpsCardPreview item={card()} />)
    expect(lastRequests()).toHaveLength(1)
    expect(lastRequests()[0]).toMatchObject({
      id: 'item-1',
      tempColor: false,
      args: { presetId: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' }, seed: stableImageSeed('item-1') },
    })
  })

  it('저장된 이미지가 있으면 요청이 비고, 그 이미지를 그대로 보인다', () => {
    const out = html(<OpsCardPreview item={card({ original: { resource: { cover_image_url: 'https://example.com/a.png' } } })} />)
    expect(lastRequests()).toEqual([])
    expect(out).not.toContain(PREVIEW_IMAGE_DRAWING_TEXT)
    expect(out).not.toContain(PREVIEW_IMAGE_DRAWN_TEXT)
  })

  it('preset_id가 없거나 image_spec이 없으면 요청이 비고 지금 문구를 유지한다', () => {
    const noPreset = html(<OpsCardPreview item={card({ original: { image_spec: { bg: '#111111', end: '#222222' } } })} />)
    expect(lastRequests()).toEqual([])
    expect(noPreset).toContain(PREVIEW_IMAGE_PENDING_TEXT)
    const noSpec = html(<OpsCardPreview item={card({ original: { image_spec: undefined } })} />)
    expect(lastRequests()).toEqual([])
    expect(noSpec).toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('이미지 제작 대상 상태(승인됨·준비중·예약됨)는 요청하지 않고 「이미지 제작 필요」를 유지한다', () => {
    for (const status of ['approved', 'preparing', 'scheduled']) {
      const out = html(<OpsCardPreview item={card({ status })} />)
      expect(lastRequests()).toEqual([])
      expect(out).toContain(PREVIEW_IMAGE_NEEDED_TEXT)
    }
  })

  it('카드가 아닌 종류는 요청하지 않는다', () => {
    html(<OpsCardPreview item={{ ...card(), kind: 'jam_badge', original: { copy: { name: '배지' }, image_spec: SPEC } as never }} />)
    expect(lastRequests()).toEqual([])
  })

  it('저장된 수정본의 image_spec이 있으면 원본 대신 그것으로 요청한다(초안 편집 칸은 copy·colors라 image_spec을 바꾸지 않는다)', () => {
    const item = { ...card(), edited: { image_spec: { ...SPEC, values: { title: '고친 문구' } } } as never }
    html(<OpsCardPreview item={item} draft={{ 'copy.title': '바뀐 제목' }} />)
    expect(lastRequests()[0].args.values).toEqual({ title: '고친 문구' })
  })

  it('색이 없으면 임시 중립색을 요청하고 임시 색 안내를 보인다', () => {
    snapshot = new Map([['item-1', { status: 'ready', url: 'blob:abc', tempColor: true }]])
    const out = html(<OpsCardPreview item={card({ original: { image_spec: { preset_id: 'p1' } } })} />)
    expect(lastRequests()[0]).toMatchObject({ tempColor: true, args: { bg: PREVIEW_NEUTRAL_BG } })
    expect(out).toContain(PREVIEW_IMAGE_TEMP_COLOR_TEXT)
    expect(out).not.toContain(PREVIEW_IMAGE_DRAWN_TEXT)
  })

  it('그리는 중에는 「이미지를 그리는 중이에요」를 보인다(상태가 아직 없을 때도 같다)', () => {
    expect(html(<OpsCardPreview item={card()} />)).toContain(PREVIEW_IMAGE_DRAWING_TEXT)
    snapshot = new Map([['item-1', { status: 'rendering', url: null, tempColor: false }]])
    const out = html(<OpsCardPreview item={card()} />)
    expect(out).toContain(PREVIEW_IMAGE_DRAWING_TEXT)
    expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('다 그리면 그려진 주소를 이미지 칸에 넣고 「승인하면 이 이미지로 만들어요」를 보인다', () => {
    snapshot = new Map([['item-1', { status: 'ready', url: 'blob:http://localhost/abc', tempColor: false }]])
    const out = html(<OpsCardPreview item={card()} />)
    expect(out).toContain('blob:http://localhost/abc')
    expect(out).toContain(PREVIEW_IMAGE_DRAWN_TEXT)
    expect(out).not.toContain(PREVIEW_IMAGE_PENDING_TEXT)
  })

  it('렌더가 실패하면 지금처럼 자리 표시와 「이미지는 승인 뒤 만들어요」로 돌아가고 화면을 깨뜨리지 않는다', () => {
    snapshot = new Map([['item-1', { status: 'failed', url: null, tempColor: false }]])
    const out = html(<OpsCardPreview item={card()} />)
    expect(out).toContain(PREVIEW_IMAGE_PENDING_TEXT)
    expect(out).not.toContain(PREVIEW_IMAGE_DRAWING_TEXT)
    expect(out).toContain('우산 챙겨 달리기')
  })

  it('저장 API를 부르지 않는다', () => {
    snapshot = new Map([['item-1', { status: 'ready', url: 'blob:x', tempColor: false }]])
    html(<OpsCardPreview item={card()} />)
    expect(post).not.toHaveBeenCalled()
  })
})
