/**
 * 배지 목록 탭·필터 URL 쿼리 동기화 시험 (티켓 20261125_1136).
 *
 * - `?tab=collection|checkin` 및 구 별칭 `?tab=poi`로 열면 해당 탭이 선택된다.
 * - 탭 전환 시 해시가 아니라 쿼리 정본(`/badges?tab=collection`)으로 `replaceState`를 호출하며
 *   기본 탭(`activity`)은 쿼리에서 빠지고 이전 탭 전용 필터 키도 정리된다.
 * - 배지 카드에 해시를 지우는 `onNavigate` 꼼수가 더 이상 붙지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/__tests__/BadgesClient.url-query.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const nav = vi.hoisted(() => ({ query: '' }))
const tabs = vi.hoisted(() => ({ onChange: null as null | ((key: string) => void), value: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/badges',
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/components/ui/SlidingTabs', () => ({
  default: (props: { value: string; onChange: (key: string) => void }) => {
    tabs.onChange = props.onChange
    tabs.value = props.value
    return <div data-testid="tabs" data-value={props.value} />
  },
}))

import BadgesClient from '../BadgesClient'

function render(initialTab?: string) {
  return renderToStaticMarkup(
    <BadgesClient badges={[]} itemBooks={[]} itemBookProgress={[]} checkinBadges={[]} initialTab={initialTab} />,
  )
}

describe('BadgesClient 탭·필터 URL 쿼리 동기화', () => {
  let replaceState: ReturnType<typeof vi.fn>

  beforeEach(() => {
    nav.query = ''
    tabs.onChange = null
    tabs.value = ''
    replaceState = vi.fn()
    vi.stubGlobal('window', {
      location: { hash: '' },
      history: { state: { __NA: true, __jamNavIdx: 0 }, replaceState },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('쿼리가 없으면 기본 activity 탭이다', () => {
    render()
    expect(tabs.value).toBe('activity')
  })

  it('?tab=collection·?tab=checkin·구 별칭 ?tab=poi를 해당 탭으로 연다', () => {
    nav.query = 'tab=collection'
    render()
    expect(tabs.value).toBe('collection')

    nav.query = 'tab=checkin'
    render()
    expect(tabs.value).toBe('checkin')

    nav.query = 'tab=poi'
    render()
    expect(tabs.value).toBe('checkin')
  })

  it('알 수 없는 탭 값은 activity로 떨어진다', () => {
    nav.query = 'tab=unknown'
    render()
    expect(tabs.value).toBe('activity')
  })

  it('컬렉션 탭 전환 시 해시가 아닌 ?tab=collection으로 replaceState를 호출한다', () => {
    nav.query = 'activity=running&rarity=rare'
    render()
    tabs.onChange?.('collection')
    expect(replaceState).toHaveBeenCalledWith({ __jamNavIdx: 0 }, '', '/badges?tab=collection')
  })

  it('기본(activity) 탭으로 돌아오면 tab·이전 탭 필터 쿼리가 모두 빠진다', () => {
    nav.query = 'tab=checkin&category=mountain&sort=name'
    render()
    tabs.onChange?.('activity')
    expect(replaceState).toHaveBeenCalledWith({ __jamNavIdx: 0 }, '', '/badges')
  })

  it('배지 카드 이동 시 해시를 지우는 clearHashOnNavigate가 제거되어 있다', () => {
    const src = readFileSync(path.resolve(__dirname, '../BadgesClient.tsx'), 'utf8')
    expect(src).not.toContain('clearHashOnNavigate')
  })
})
