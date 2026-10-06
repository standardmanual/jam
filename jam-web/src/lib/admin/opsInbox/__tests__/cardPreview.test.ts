import { describe, it, expect } from 'vitest'
import { applyDraftToItem } from '@/lib/admin/opsInbox/editDraft'
import { PREVIEW_TITLE_PLACEHOLDER, itemToPreviewCard, previewViewOf, type PreviewItem } from '@/lib/admin/opsInbox/cardPreview'

const NOW = new Date('2026-10-06T00:00:00.000Z')

function card(original: Record<string, unknown>, edited: Record<string, unknown> | null = null, kind: string | null = 'home_feed_card'): PreviewItem {
  return { id: 'item-1', kind, original: original as never, edited: edited as never }
}

const FULL = {
  shape: 'hero',
  starts_at: '2026-10-07T00:00:00.000Z',
  ends_at: '2026-10-08T00:00:00.000Z',
  exposure_tags: ['all'],
  copy: { title: '우산 챙겨 달리기', subtitle: '비 오는 날' },
  colors: { background: '#1a2b3c' },
  resource: { template_type: 'editorial_article', cover_image_url: 'https://example.com/a.png', mission_id: 'm-1', badge_ids: ['b-1'] },
}

describe('applyDraftToItem', () => {
  it('문안·색을 키 단위로 덮고 입력 항목은 바꾸지 않는다', () => {
    const item = card(FULL)
    const next = applyDraftToItem(item, { 'copy.title': '새 제목', 'colors.background': '#ffffff' })
    expect(next.edited).toEqual({ copy: { title: '새 제목', subtitle: '비 오는 날' }, colors: { background: '#ffffff' } })
    expect(item.edited).toBeNull()
  })

  it('시각은 비어 있지 않은 값만 덮고 글자가 아닌 값·모르는 경로는 무시한다', () => {
    const next = applyDraftToItem(card(FULL), { starts_at: '2026-10-09T00:00:00.000Z', ends_at: '', 'copy.title': 3, user_experience: 'x' })
    expect(next.edited).toEqual({ starts_at: '2026-10-09T00:00:00.000Z' })
  })

  it('덮을 값이 없으면 수정본을 만들지 않는다', () => {
    expect(applyDraftToItem(card(FULL), {}).edited).toBeNull()
  })
})

describe('itemToPreviewCard', () => {
  it('카드 칸을 읽어 표시용 카드 행을 만든다(연결된 미션·배지는 읽지 않는다)', () => {
    const row = itemToPreviewCard(card(FULL), undefined, { now: NOW })!
    expect(row.title).toBe('우산 챙겨 달리기')
    expect(row.subtitle).toBe('비 오는 날')
    expect(row.cover_image_url).toBe('https://example.com/a.png')
    expect(row.shape).toBe('hero')
    expect(row.exposure_tags).toEqual(['all'])
    expect(row.mission_id).toBeNull()
    expect(row.badge_ids).toEqual([])
    expect(row.starts_at).toBe('2026-10-07T00:00:00.000Z')
  })

  it('초안이 문안을 덮는다', () => {
    expect(itemToPreviewCard(card(FULL), { 'copy.title': '바뀐 제목' }, { now: NOW })!.title).toBe('바뀐 제목')
  })

  it('copy에 없으면 resource의 글자 칸을 읽는다', () => {
    const row = itemToPreviewCard(card({ resource: { title: '자원 제목' } }), undefined, { now: NOW })!
    expect(row.title).toBe('자원 제목')
  })

  it('제목이 비면 「(제목 미입력)」, 없는 칸은 비우고 읽을 수 없는 시각은 기준 시각이다', () => {
    const row = itemToPreviewCard(card({}), { 'copy.title': '  ' }, { now: NOW })!
    expect(row.title).toBe(PREVIEW_TITLE_PLACEHOLDER)
    expect(row.subtitle).toBeNull()
    expect(row.shape).toBeNull()
    expect(row.exposure_tags).toEqual([])
    expect(row.starts_at).toBe(NOW.toISOString())
  })

  it('모양이 「모름」이면 shape를 비워 resolveShape에 맡긴다', () => {
    const view = previewViewOf(card({ shape: '이상한값', copy: { title: 'a' } }), undefined, { now: NOW })!
    expect(['hero', 'poster', 'square', 'brief', 'list']).toContain(view.shape)
  })

  it('카드가 아닌 종류는 null이다', () => {
    expect(itemToPreviewCard(card(FULL, null, 'mission'), undefined, { now: NOW })).toBeNull()
    expect(previewViewOf(card(FULL, null, null), undefined, { now: NOW })).toBeNull()
  })
})

describe('previewViewOf', () => {
  it('표시 데이터에 계측 정보가 없다', () => {
    const view = previewViewOf(card(FULL), undefined, { now: NOW })!
    expect(view.title).toBe('우산 챙겨 달리기')
    expect(view.shape).toBe('hero')
    expect(view.tracking).toBeUndefined()
  })
})
