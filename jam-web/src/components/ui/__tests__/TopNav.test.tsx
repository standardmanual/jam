/**
 * TopNav `centerSlotOverride` 분기 (티켓 20260927_2331, 상위 20260927_2123 T2c).
 *
 * 온보딩 퀘스트 `sync` 차례에 홈이 넘기는 override가 stravaConnected 분기(SyncButton·
 * 연동 유도 버튼)를 가리는지만 고정한다. Provider 없이 렌더하면 `useTopNavData` 기본값
 * (stravaConnected: false)이 적용되므로, override 미지정 시 연동 유도 버튼(「동기화」
 * 라벨 + `/api/strava/auth` 이동)이 보인다는 것도 함께 확인한다.
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import TopNav from '../TopNav'

describe('TopNav centerSlotOverride', () => {
  it('override가 없으면 기존 연동 유도 버튼(동기화)이 보인다', () => {
    const html = renderToStaticMarkup(<TopNav logo />)
    expect(html).toContain('동기화')
  })

  it('override가 있으면 그 내용이 렌더되고 기존 연동 유도 버튼은 사라진다', () => {
    const html = renderToStaticMarkup(<TopNav logo centerSlotOverride={<span>연출 동기화 버튼</span>} />)
    expect(html).toContain('연출 동기화 버튼')
    expect(html).not.toContain('>동기화<')
  })
})
