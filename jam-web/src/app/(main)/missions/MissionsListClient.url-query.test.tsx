/**
 * 미션 목록 탭의 URL 쿼리 반영 (티켓 20261110_1217)
 *
 * - ?tab=joined|ended 로 열면 그 탭이 선택돼 있다. 없거나 모르는 값이면 진행중.
 * - 탭을 바꾸면 router.replace({ scroll: false })로 같은 키를 쓴다. 진행중(기본)은 쿼리에서 뺀다.
 * 저장소에 jsdom이 없어 서버 렌더로 초기 선택을 보고, 전환은 SlidingTabs를 대역으로 바꿔 onChange를 직접 부른다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/MissionsListClient.url-query.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  query: '',
}))
const tabs = vi.hoisted(() => ({ onChange: null as null | ((key: string) => void), value: '' }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/missions',
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
vi.mock('@/components/ui/SlidingTabs', () => ({
  default: (props: { value: string; onChange: (key: string) => void }) => {
    tabs.onChange = props.onChange
    tabs.value = props.value
    return <div data-testid="tabs" data-value={props.value} />
  },
}))

import MissionsListClient from './MissionsListClient'

function render() {
  return renderToStaticMarkup(<MissionsListClient ongoing={[]} ended={[]} rewardBadgeNames={{}} />)
}

describe('미션 목록 탭 URL 반영', () => {
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

  it('쿼리가 없으면 진행중 탭', () => {
    render()
    expect(tabs.value).toBe('ongoing')
  })

  it.each(['joined', 'ended'])('?tab=%s 로 열면 그 탭이 선택돼 있다', (tab) => {
    nav.query = `tab=${tab}`
    render()
    expect(tabs.value).toBe(tab)
  })

  it('알 수 없는 값은 진행중 탭으로 연다', () => {
    nav.query = 'tab=xyz'
    render()
    expect(tabs.value).toBe('ongoing')
  })

  it('탭을 바꾸면 replace(scroll:false)로 쿼리를 쓰고 history는 쌓지 않는다', () => {
    render()
    tabs.onChange?.('ended')
    expect(nav.replace).toHaveBeenCalledWith('/missions?tab=ended', { scroll: false })
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('기본 탭(진행중)으로 돌아오면 쿼리가 빠진다', () => {
    nav.query = 'tab=ended'
    render()
    tabs.onChange?.('ongoing')
    expect(nav.replace).toHaveBeenCalledWith('/missions', { scroll: false })
  })
})
