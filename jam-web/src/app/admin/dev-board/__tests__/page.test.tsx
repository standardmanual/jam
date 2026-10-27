/**
 * 개발·배포 상황판 페이지 조립 (티켓 20261026_2028 3회차)
 *
 * 구역은 `_sections`의 가짜(표식만 그리는 컴포넌트)로 바꿔 **페이지가 하는 일**만 본다: 머리, 구역 순서, 구역마다 `Suspense`,
 * 스냅샷을 한 번만 읽어 모든 구역에 같이 넘기기, 캐시하지 않는 동적 페이지, 읽기만 하는 화면(버튼 없음). 구역 안의 읽기·격리는 `sections.test.tsx`가 본다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const hoisted = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  startDevBoard: vi.fn(),
  suspended: new Set<string>(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('../_sections', () => ({
  startDevBoard: hoisted.startDevBoard,
  AsOfSection: (props: Record<string, unknown>) => stub('asof', props),
  NoticesSection: (props: Record<string, unknown>) => stub('notices', props),
  DeploySection: (props: Record<string, unknown>) => stub('deploy', props),
  BundleSection: (props: Record<string, unknown>) => stub('bundles', props),
  BoardSection: (props: Record<string, unknown>) => stub('board', props),
}))

function stub(key: string, props: Record<string, unknown>): ReactElement {
  hoisted.props[key] = props
  if (hoisted.suspended.has(key)) throw new Promise(() => {})
  return <div data-section={key} />
}

import DevBoardPage, { dynamic } from '../page'

const READ = Promise.resolve({ ok: false as const })

function renderPage(): string {
  return renderToStaticMarkup(<DevBoardPage />)
}

function sectionOrder(markup: string): string[] {
  return [...markup.matchAll(/data-section="([a-z]+)"/g)].map((match) => match[1])
}

beforeEach(() => {
  hoisted.props = {}
  hoisted.suspended.clear()
  hoisted.startDevBoard.mockReset()
  hoisted.startDevBoard.mockReturnValue(READ)
})

describe('개발·배포 상황판 페이지', () => {
  it('캐시하지 않는 동적 페이지다', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('머리 다음에 기준 시각 → 읽기 안내 줄 → 배포 현황 → 묶음 → 보드 순서로 둔다', () => {
    const markup = renderPage()
    expect(markup).toContain('개발·배포 상황판')
    expect(sectionOrder(markup)).toEqual(['asof', 'notices', 'deploy', 'bundles', 'board'])
  })

  it('스냅샷은 한 번만 읽어 모든 구역에 같은 약속을 넘긴다', () => {
    renderPage()
    expect(hoisted.startDevBoard).toHaveBeenCalledTimes(1)
    for (const key of ['asof', 'notices', 'deploy', 'bundles', 'board']) {
      expect(hoisted.props[key].read).toBe(READ)
    }
  })

  it('구역이 읽히는 동안 그 구역만 스켈레톤이 보이고 나머지는 그대로다', () => {
    hoisted.suspended.add('bundles')
    const markup = renderPage()
    expect(sectionOrder(markup)).toEqual(['asof', 'notices', 'deploy', 'board'])
    expect(markup).toContain('aria-label="불러오는 중"')
  })

  it('읽기만 하는 화면이라 개발 요청을 만드는 버튼이 없다', () => {
    const markup = renderPage()
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('개발 요청하기')
  })
})
