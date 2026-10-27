/**
 * 트렌드 걸러 보기 (티켓 20261026_2033 2회차)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 처음 그린 모양을 고정한다: `trendFilter`가 있으면 목록·탭 숫자가 그 항목으로 좁혀지고 알림 줄에
 * 「「이름」 트렌드에서 나온 항목 N건만 보고 있어요」와 [전체 보기]가 나오며, 결정 패널의 승인 대상 건수와 「N건 승인하고 예약」은
 * 좁히기와 상관없이 전체 항목 기준 그대로다. [전체 보기]를 누른 뒤(쿼리 지우기)는 브라우저 동작이라 화면 확인에 맡긴다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-inbox/bundle-1',
  useSearchParams: () => new URLSearchParams('trend=0'),
}))

import { narrowItemsToIds } from '@/lib/admin/opsInbox/itemView'
import type { OpsBundleExecution, OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OpsBundleWorkspace, trendFilterNotice } from '../OpsBundleWorkspace'
import { OpsDecisionWorkspace } from '../OpsDecisionWorkspace'

const flat = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>).replace(/<!-- -->/g, '')

function makeItem(id: string, position: number, overrides: Partial<OpsItemRecord> = {}): OpsItemRecord {
  return {
    id,
    position,
    itemKey: id,
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: '2026-10-05T09:00:00+09:00',
    endsAt: '2026-10-06T09:00:00+09:00',
    status: 'reviewing',
    original: { user_experience: `${id} 경험`, copy: { title: `${id} 카드` }, colors: { background: '#1a2b3c' } },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

const items = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
const FILTER = { label: '러닝 크루', itemIds: ['b'] }
const NO_EXECUTION: OpsBundleExecution = { approvedCount: 0, readyCount: 0 }
const shell = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], decisions: [] }

describe('narrowItemsToIds', () => {
  it('ids가 없으면 그대로, 있으면 그 ID만 순서를 지켜 남긴다', () => {
    expect(narrowItemsToIds(items, null)).toBe(items)
    expect(narrowItemsToIds(items, undefined)).toBe(items)
    expect(narrowItemsToIds(items, ['c', 'a']).map((item) => item.id)).toEqual(['a', 'c'])
    expect(narrowItemsToIds(items, [])).toEqual([])
  })
})

describe('OpsBundleWorkspace — trendFilter', () => {
  it('걸러 보기가 없으면 알림 줄도 [전체 보기]도 없고 항목이 모두 나온다', () => {
    const out = flat(<OpsBundleWorkspace {...shell} items={items} />)
    expect(out).not.toContain('트렌드에서 나온 항목')
    for (const id of ['a', 'b', 'c']) expect(out).toContain(`id="ops-item-row-${id}"`)
  })

  it('걸러 보기가 있으면 목록이 그 항목으로 좁혀지고 알림 줄에 건수와 [전체 보기]가 나온다', () => {
    const out = flat(<OpsBundleWorkspace {...shell} items={items} trendFilter={FILTER} />)
    expect(out).toContain(trendFilterNotice('러닝 크루', 1))
    expect(out).toContain('「러닝 크루」 트렌드에서 나온 항목 1건만 보고 있어요')
    expect(out).toMatch(/<button[^>]*>전체 보기<\/button>/)
    expect(out).toContain('id="ops-item-row-b"')
    expect(out).not.toContain('id="ops-item-row-a"')
    expect(out).not.toContain('id="ops-item-row-c"')
  })

  it('처음 선택도 좁힌 목록 안에서 고른다', () => {
    const out = flat(<OpsBundleWorkspace {...shell} items={items} trendFilter={FILTER} />)
    expect(out).toMatch(/id="ops-item-row-b"[^>]*border-l-primary/)
  })

  it('탭 숫자도 좁힌 항목 기준이다', () => {
    const out = flat(<OpsBundleWorkspace {...shell} items={items} trendFilter={FILTER} />)
    // 전체 탭의 숫자: 3이 아니라 1
    expect(out).toMatch(/전체<span[^>]*>1<\/span>/)
  })
})

describe('OpsDecisionWorkspace — trendFilter와 승인 대상', () => {
  const props = { bundleId: 'bundle-1', bundleFormatErrors: [] as string[], execution: NO_EXECUTION, decisions: [] }

  it('좁혀도 「N건 승인하고 예약」은 전체 항목 기준 그대로다', () => {
    const plain = flat(<OpsDecisionWorkspace {...props} items={items} />)
    const narrowed = flat(<OpsDecisionWorkspace {...props} items={items} trendFilter={FILTER} />)
    expect(plain).toContain('>3건 승인하고 예약<')
    expect(narrowed).toContain('>3건 승인하고 예약<')
    expect(narrowed).toContain('결정할 것 3개 중 3개 선택')
  })

  it('좁힌 목록에는 그 항목의 체크박스만 남는다', () => {
    const narrowed = flat(<OpsDecisionWorkspace {...props} items={items} trendFilter={FILTER} />)
    expect(narrowed).toContain('트렌드에서 나온 항목 1건만 보고 있어요')
    // 체크박스: 머리줄 1개 + 좁힌 목록의 행 1개
    expect(narrowed.match(/role="checkbox"/g)).toHaveLength(2)
  })
})
