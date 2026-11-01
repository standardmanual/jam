/**
 * 「홈피드로 보기」의 승인 전 카드 이미지 바로 그리기 (티켓 20261101_2149)
 *
 * 확인하는 것: 승인 전 카드 가운데 저장된 이미지가 없고 `preset_id`가 있는 카드만 요청한다(실제 카드·이미지가 있는 카드·지시 없는 카드는 렌더를 부르지 않는다) /
 * 요청의 시드는 항목 ID의 고정 시드 / 그려진 주소만 해당 카드의 이미지 칸에 들어가고 저장된 이미지는 그대로 / 저장 API를 부르지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/preview/__tests__/homeDraftImages.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const post = vi.fn()
vi.mock('../../imageClient', () => ({ postItemImage: (...a: unknown[]) => post(...a) }))

import { toCardView } from '@/lib/today/cardView'
import { stableImageSeed } from '@/lib/admin/opsInbox/imageSpec'
import { draftImageRequestsFor, withDraftImages } from '../HomePreviewPanel'
import type { DraftImageSnapshot } from '../../useDraftImagePreview'
import { live, makeCard, makeDay, pending } from './fixtures'
import type { PreviewEntry } from '../homePreviewClient'

const SPEC = { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } }

function pendingWith(id: string, imageSpec: PreviewEntry['imageSpec'], cover: string | null = null, shape = 'hero'): PreviewEntry {
  const base = pending(id, [], shape)
  return { ...base, card: makeCard(id, { shape, cover_image_url: cover } as never), imageSpec }
}

describe('draftImageRequestsFor', () => {
  it('저장된 이미지가 없고 preset_id가 있는 승인 전 카드만 항목 ID의 고정 시드로 요청한다', () => {
    const day = makeDay('2026-10-07', [
      pendingWith('p-draw', SPEC),
      pendingWith('p-stored', SPEC, 'https://example.com/a.png'),
      pendingWith('p-nospec', null),
      pendingWith('p-nopreset', { bg: '#111111', end: '#222222' }),
      { ...live('l-1'), imageSpec: SPEC },
    ])
    const requests = draftImageRequestsFor(day)
    expect(requests.map((r) => r.id)).toEqual(['p-draw'])
    expect(requests[0]).toMatchObject({ tempColor: false, args: { presetId: 'p1', seed: stableImageSeed('p-draw') } })
  })

  it('색이 없는 카드는 임시 색으로 요청한다', () => {
    const day = makeDay('2026-10-07', [pendingWith('p-1', { preset_id: 'p1' })])
    expect(draftImageRequestsFor(day)[0].tempColor).toBe(true)
  })

  it('날이 없거나 승인 전 카드가 없으면 요청이 비어 렌더를 부르지 않는다', () => {
    expect(draftImageRequestsFor(undefined)).toEqual([])
    expect(draftImageRequestsFor(makeDay('2026-10-07', [live('l-1')]))).toEqual([])
  })
})

describe('withDraftImages', () => {
  const day = makeDay('2026-10-07', [pendingWith('p-draw', SPEC), pendingWith('p-stored', SPEC, 'https://example.com/a.png'), pendingWith('p-wait', SPEC)])
  const views = day.entries.map((e) => toCardView(e.card, { now: new Date('2026-10-07T00:00:00Z') }))

  it('그려진 주소는 해당 카드의 이미지 칸에 넣고, 저장된 이미지와 아직 그리는 중인 카드는 그대로 둔다', () => {
    const drafts: DraftImageSnapshot = new Map([
      ['p-draw', { status: 'ready', url: 'blob:draw', tempColor: false }],
      ['p-stored', { status: 'ready', url: 'blob:stored', tempColor: false }],
      ['p-wait', { status: 'rendering', url: null, tempColor: false }],
    ])
    const out = withDraftImages(views, day, drafts) as { imageUrl: string | null }[]
    expect(out[0].imageUrl).toBe('blob:draw')
    expect(out[1].imageUrl).toBe('https://example.com/a.png')
    expect(out[2].imageUrl).toBeNull()
  })

  it('실패한 카드는 그대로(자리 표시)이고, 입력한 표시 데이터를 바꾸지 않는다', () => {
    const drafts: DraftImageSnapshot = new Map([['p-draw', { status: 'failed', url: null, tempColor: false }]])
    const out = withDraftImages(views, day, drafts) as { imageUrl: string | null }[]
    expect(out[0].imageUrl).toBeNull()
    const ok = withDraftImages(views, day, new Map([['p-draw', { status: 'ready', url: 'blob:x', tempColor: false }]]))
    expect(ok[0]).not.toBe(views[0])
    expect((views[0] as { imageUrl: string | null }).imageUrl).toBeNull()
  })

  it('저장 API를 부르지 않는다', () => {
    draftImageRequestsFor(day)
    withDraftImages(views, day, new Map())
    expect(post).not.toHaveBeenCalled()
  })
})
