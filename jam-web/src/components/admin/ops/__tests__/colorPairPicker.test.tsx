/**
 * 색 대기 카드의 색 쌍 고르기 (티켓 20261007_1146 ④-b)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더로 처음 그린 모양과 순수 함수만 본다. 요청 본문은 `decisionClient.test.ts`가 지킨다.
 * 지키는 것:
 * - 보이는 조건: 검토중이고 `color_pending`이 참인 카드뿐(승인됨·색 대기 아님·수정 중이면 그리지 않는다)
 * - 목록: 트라이브 카드는 그 트라이브의 승인 쌍만, `tribe_id`가 없으면 공통 쌍, 이력 없는 트라이브는 안내와 직접 입력만
 * - 고른 쌍이 눌린 상태로 보이고, 직접 입력은 형식이 틀리면 문장이 보이며 안 골랐으면 [적용하기]가 막힌다
 * - 미리보기 덮어쓰기: 고른 쌍이 `colors.bg`·`colors.end`로 들어가고 수정 초안을 해치지 않는다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { COMMON_APPROVED_PAIRS, TRIBE_APPROVED_PAIRS } from '@/lib/admin/opsInbox/tribePalettes'
import type { OpsWorkspaceContext } from '../OpsBundleWorkspace'
import { OpsColorPairPicker, canApplyColorPick, canPickColor, withColorPick } from '../OpsColorPairPicker'

const FOREST_GANG = '73f0f601-2382-900c-8ca2-5cc7c93ed95d'
const UNKNOWN_TRIBE = '11111111-1111-4111-8111-111111111111'

function makeItem(original: Record<string, unknown> = {}, overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: '2026-10-05T09:00:00+09:00',
    endsAt: null,
    status: 'reviewing',
    original: { color_pending: true, ...original },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

function render(item: OpsItemRecord, extra: Partial<OpsWorkspaceContext> = {}) {
  const ctx: OpsWorkspaceContext = {
    bundleId: 'bundle-1',
    items: [item],
    selectedItem: item,
    draft: null,
    setDraft: vi.fn(),
    selectItem: vi.fn(),
    setColorPick: vi.fn(),
    ...extra,
  }
  return renderToStaticMarkup(<OpsColorPairPicker bundleId="bundle-1" item={item} ctx={ctx} onFilled={vi.fn()} onConflict={vi.fn()} />).replace(/<!-- -->/g, '')
}

describe('OpsColorPairPicker — 보이는 조건', () => {
  it('검토중이고 색 대기면 그린다', () => {
    expect(render(makeItem())).toContain('색을 골라 주세요')
  })

  it('색 대기가 아니거나 검토중이 아니면 그리지 않는다', () => {
    expect(render(makeItem({ color_pending: false }))).toBe('')
    expect(render(makeItem({}, { status: 'approved' }))).toBe('')
    expect(canPickColor(makeItem({ color_pending: 'yes' }))).toBe(false)
  })

  it('이 항목을 수정 중이면 그리지 않는다', () => {
    const item = makeItem()
    expect(render(item, { draft: { itemId: item.id, values: {} } })).toBe('')
  })
})

describe('OpsColorPairPicker — 승인 쌍 목록', () => {
  it('tribe_id가 없으면 공통 쌍을 모두 보인다', () => {
    const out = render(makeItem())
    for (const pair of COMMON_APPROVED_PAIRS) expect(out).toContain(pair.name)
  })

  it('트라이브 카드는 그 트라이브의 쌍만 보인다', () => {
    const out = render(makeItem({ tribe_id: FOREST_GANG }))
    for (const pair of TRIBE_APPROVED_PAIRS[FOREST_GANG]) expect(out).toContain(pair.name)
    expect(out).not.toContain(COMMON_APPROVED_PAIRS[0].name)
  })

  it('이력 없는 트라이브는 쌍 목록 없이 안내와 직접 입력만 보인다', () => {
    const out = render(makeItem({ tribe_id: UNKNOWN_TRIBE }))
    expect(out).toContain('승인된 색 쌍이 아직 없어요')
    expect(out).not.toContain('aria-label="승인된 색 쌍"')
    expect(out).toContain('시작색')
    expect(out).toContain('끝색')
  })

  it('고른 쌍은 눌린 상태이고, 아무것도 안 골랐으면 [적용하기]가 막혀 있다', () => {
    const pair = COMMON_APPROVED_PAIRS[0]
    const picked = render(makeItem(), { colorPick: { itemId: 'item-1', bg: pair.bg, end: pair.end } })
    expect(picked).toContain('aria-pressed="true"')
    expect(picked).not.toMatch(/<button[^>]*disabled=""[^>]*>적용하기/)
    const empty = render(makeItem())
    expect(empty).not.toContain('aria-pressed="true"')
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>적용하기/)
  })

  it('직접 입력이 형식에 안 맞으면 문장을 보인다', () => {
    const out = render(makeItem(), { colorPick: { itemId: 'item-1', bg: '#12', end: '' } })
    expect(out).toContain('색은 #rrggbb 형식으로 적어 주세요')
  })
})

describe('canApplyColorPick', () => {
  it('시작색·끝색이 모두 #rrggbb일 때만 참이다', () => {
    expect(canApplyColorPick('#8a5a2e', '#3d2812')).toBe(true)
    expect(canApplyColorPick('#8a5a2e', '')).toBe(false)
    expect(canApplyColorPick('red', '#3d2812')).toBe(false)
  })
})

describe('withColorPick — 미리보기 덮어쓰기', () => {
  const pick = { itemId: 'item-1', bg: '#8a5a2e', end: '#3d2812' }

  it('고른 값이 없거나 다른 항목의 것이면 수정 초안 그대로다', () => {
    const draft = { itemId: 'item-1', values: { 'copy.title': '제목' } }
    expect(withColorPick('item-1', draft, null)).toBe(draft.values)
    expect(withColorPick('item-1', null, { ...pick, itemId: 'item-2' })).toBeUndefined()
  })

  it('고른 쌍을 colors.bg·colors.end로 덮고 초안 값은 남긴다', () => {
    const draft = { itemId: 'item-1', values: { 'copy.title': '제목' } }
    expect(withColorPick('item-1', draft, pick)).toEqual({ 'copy.title': '제목', 'colors.bg': '#8a5a2e', 'colors.end': '#3d2812' })
  })

  it('형식이 틀린 칸은 덮지 않는다', () => {
    expect(withColorPick('item-1', null, { itemId: 'item-1', bg: '#8a5a2e', end: '#3d' })).toEqual({ 'colors.bg': '#8a5a2e' })
    expect(withColorPick('item-1', null, { itemId: 'item-1', bg: '', end: '' })).toBeUndefined()
  })
})
