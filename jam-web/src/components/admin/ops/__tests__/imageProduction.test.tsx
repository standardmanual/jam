/**
 * 이미지 만들기 버튼과 「만드는 중」 표시 (티켓 20261007_1032 ③-b2). 서버 렌더로 처음 그린 모양만 고정한다(클릭은 카리나가 실렌더로 본다).
 *
 * - 승인됨·이미지 없음 → [이미지 만들기], 이미지 있음 → [이미지 다시 만들기]
 * - 만드는 중이면 버튼이 잠기고 「만드는 중」
 * - 승인됨·준비중·예약됨은 같다
 * - 시험 묶음·검토중·게재중·`image_spec` 없음·이미지 칸 없는 종류는 아무것도 그리지 않는다
 * - 미리보기: 이미지가 빈 승인됨 항목은 「이미지 제작 필요」, 만드는 중이면 「이미지를 만드는 중이에요」
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OpsImageProduction, IMAGE_MAKE_LABEL, IMAGE_MAKING_TEXT, IMAGE_REMAKE_LABEL } from '../OpsImageProduction'
import { OpsCardPreview, PREVIEW_IMAGE_MAKING_TEXT, PREVIEW_IMAGE_NEEDED_TEXT } from '../OpsCardPreview'
import type { ItemImageProduction } from '../useItemImageProduction'

const SPEC = { preset_id: 'p1', bg: '#111111', end: '#222222' }

function makeItem(over: Partial<OpsItemRecord> = {}, original: Record<string, unknown> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: 'P-07',
    startsAt: '2026-10-06T09:00:00+09:00',
    endsAt: null,
    status: 'approved',
    original: { shape: 'hero', copy: { title: '제목' }, image_spec: SPEC, ...original },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  } as OpsItemRecord
}

function production(making: string[] = [], start = vi.fn()): ItemImageProduction {
  return { making: new Set(making), start, startMany: vi.fn() }
}

function html(item: OpsItemRecord, opts: { isSample?: boolean; making?: string[] } = {}): string {
  return renderToStaticMarkup(
    <OpsImageProduction item={item} items={[item]} isSample={opts.isSample ?? false} production={production(opts.making)} />
  ).replace(/<!-- -->/g, '')
}

describe('OpsImageProduction', () => {
  it('승인됨·이미지 없음이면 [이미지 만들기]', () => {
    expect(html(makeItem())).toContain(IMAGE_MAKE_LABEL)
    expect(html(makeItem({ status: 'preparing' }))).toContain(IMAGE_MAKE_LABEL)
  })

  it('예약됨·이미지 없음이어도 [이미지 만들기]가 보인다(티켓 20261026_2034)', () => {
    expect(html(makeItem({ status: 'scheduled' }))).toContain(IMAGE_MAKE_LABEL)
  })

  it('이미지가 있으면 [이미지 다시 만들기]', () => {
    const out = html(makeItem({}, { resource: { cover_image_url: 'https://x/y.png' } }))
    expect(out).toContain(IMAGE_REMAKE_LABEL)
    expect(out).not.toContain(`>${IMAGE_MAKE_LABEL}<`)
  })

  it('만드는 중이면 버튼이 잠기고 「만드는 중」이다', () => {
    const out = html(makeItem(), { making: ['item-1'] })
    expect(out).toContain(IMAGE_MAKING_TEXT)
    expect(out).toContain('disabled')
  })

  it('시험 묶음에서는 아무것도 그리지 않는다', () => {
    expect(html(makeItem(), { isSample: true })).toBe('')
  })

  it('승인됨·준비중·예약됨이 아니면 그리지 않는다', () => {
    for (const status of ['arrived', 'reviewing', 'live', 'rejected', 'ended']) {
      expect(html(makeItem({ status }))).toBe('')
    }
  })

  it('image_spec이 없거나 preset_id가 없으면 그리지 않는다', () => {
    expect(html(makeItem({}, { image_spec: undefined }))).toBe('')
    expect(html(makeItem({}, { image_spec: { bg: '#111111' } }))).toBe('')
  })

  it('이미지 칸이 없는 종류는 그리지 않는다', () => {
    expect(html(makeItem({ kind: 'recipe' }))).toBe('')
  })
})

describe('OpsCardPreview 만드는 중 표시', () => {
  const render = (making: boolean) => renderToStaticMarkup(<OpsCardPreview item={makeItem()} making={making} />).replace(/<!-- -->/g, '')

  it('이미지가 빈 승인됨 항목은 「이미지 제작 필요」, 만드는 중이면 「만드는 중」으로 바뀐다', () => {
    expect(render(false)).toContain(PREVIEW_IMAGE_NEEDED_TEXT)
    const making = render(true)
    expect(making).toContain(PREVIEW_IMAGE_MAKING_TEXT)
    expect(making).not.toContain(PREVIEW_IMAGE_NEEDED_TEXT)
  })
})
