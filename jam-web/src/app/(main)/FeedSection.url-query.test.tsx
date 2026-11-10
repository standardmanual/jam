/**
 * 피드 필터의 URL 쿼리 반영 (티켓 20261110_1217)
 *
 * - ?feed=badge|mission|activity_badge 로 열면 그 필터가 선택돼 있다. 없거나 모르는 값이면 전체.
 * - 필터를 바꾸면 router.replace({ scroll: false })로 feed 키만 바꾸고, ?u= 같은 다른 쿼리는 보존한다.
 *   전체(기본)로 돌아오면 feed 키만 빠진다.
 * 저장소에 jsdom이 없어 서버 렌더로 초기 선택을 보고, 전환은 SlidingTabs를 대역으로 바꿔 onChange를 직접 부른다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/FeedSection.url-query.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), query: '' }))
const tabs = vi.hoisted(() => ({ onChange: null as null | ((key: string) => void), value: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/jam',
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/components/ui/SlidingTabs', () => ({
  default: (props: { value: string; onChange: (key: string) => void }) => {
    tabs.onChange = props.onChange
    tabs.value = props.value
    return <div data-testid="tabs" data-value={props.value} />
  },
}))

import FeedSection from './FeedSection'

function render() {
  return renderToStaticMarkup(<FeedSection feedItems={[]} badgeLinkQuery="?u=jam" hideHeader />)
}

describe('피드 필터 URL 반영', () => {
  beforeEach(() => {
    nav.replace.mockClear()
    nav.push.mockClear()
    nav.query = ''
    tabs.onChange = null
    tabs.value = ''
    vi.stubGlobal('window', { location: { hash: '' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('쿼리가 없으면 전체', () => {
    render()
    expect(tabs.value).toBe('all')
  })

  it.each(['badge', 'mission', 'activity_badge'])('?feed=%s 로 열면 그 필터가 선택돼 있다', (feed) => {
    nav.query = `feed=${feed}`
    render()
    expect(tabs.value).toBe(feed)
  })

  it('알 수 없는 값은 전체로 연다', () => {
    nav.query = 'feed=xyz'
    render()
    expect(tabs.value).toBe('all')
  })

  it('필터를 바꾸면 replace(scroll:false)로 쓰고 history는 쌓지 않는다', () => {
    render()
    tabs.onChange?.('mission')
    expect(nav.replace).toHaveBeenCalledWith('/jam?feed=mission', { scroll: false })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('다른 쿼리(?u=)는 보존하고 feed 키만 바꾼다', () => {
    nav.query = 'u=jam&feed=badge'
    render()
    tabs.onChange?.('activity_badge')
    expect(nav.replace).toHaveBeenCalledWith('/jam?u=jam&feed=activity_badge', { scroll: false })
  })

  it('전체로 돌아오면 feed 키만 빠지고 나머지는 남는다', () => {
    nav.query = 'u=jam&feed=badge'
    render()
    tabs.onChange?.('all')
    expect(nav.replace).toHaveBeenCalledWith('/jam?u=jam', { scroll: false })
  })
})
