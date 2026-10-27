/**
 * 투데이 카드 폼 — 노출조건 「트라이브」 묶음 (티켓 20261026_2030 2회차)
 *
 * 확인하는 것: 서버가 준 트라이브 목록대로 체크박스가 그려지고(비활성은 「(비활성)」), 카드가 이미 가진 트라이브 태그가
 * 선택 상태로 보이며, 목록에 없는 트라이브 태그는 「(삭제됐거나 모르는 트라이브)」로 남고, 목록이 비면 안내 문구가 나온다.
 * 체크했을 때 값이 `tribe_<id>`가 되는 것은 선택지 값 시험(`todayTribeTags.test.ts`)이 확인한다 — 저장소에 jsdom이 없어
 * (vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그려진 모양만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardForm.tribe.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import TodayCardForm from '../TodayCardForm'
import type { TodayCardRow } from '@/types/database'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const GONE = '33333333-3333-4333-8333-333333333333'

/** 폼이 읽는 칸만 채운 카드 — 날짜가 있어야 폼이 그려진다 */
function cardWith(exposureTags: string[]): TodayCardRow {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '시험 카드',
    exposure_tags: exposureTags,
    starts_at: '2026-10-27T00:00:00Z',
    ends_at: '2026-10-28T00:00:00Z',
    sort_order: 0,
    is_active: true,
  } as unknown as TodayCardRow
}

const BASE_PROPS: ComponentProps<typeof TodayCardForm> = {
  missions: [],
  itemBooks: [],
  rankingModes: [],
  recipes: [],
  badgeLabels: [],
  returnDate: '2026-10-27',
}

function render(props: Partial<ComponentProps<typeof TodayCardForm>>): string {
  return renderToStaticMarkup(<TodayCardForm {...BASE_PROPS} {...props} />)
}

/** 트라이브 묶음 영역만 잘라낸다 */
function tribeGroup(html: string): string {
  const start = html.indexOf('data-testid="today-card-tribe-tags"')
  expect(start).toBeGreaterThan(-1)
  return html.slice(start, html.indexOf('하나라도 해당하면 노출돼요', start))
}

describe('TodayCardForm — 트라이브 묶음', () => {
  it('트라이브 목록대로 체크박스를 그리고 비활성에 (비활성)을 붙인다', () => {
    const group = tribeGroup(
      render({
        tribes: [
          { id: A, name: '숲속의 갱단', is_active: true },
          { id: B, name: '새 트라이브', is_active: false },
        ],
      })
    )
    expect(group).toContain('트라이브')
    expect(group).toContain('숲속의 갱단')
    expect(group).toContain('새 트라이브 (비활성)')
    expect(group.match(/role="checkbox"/g)).toHaveLength(2)
    expect(group.match(/aria-checked="false"/g)).toHaveLength(2)
  })

  it('카드가 이미 가진 트라이브 태그는 체크된 상태로 보인다', () => {
    const card = cardWith([`tribe_${A}`])
    const group = tribeGroup(
      render({
        card,
        tribes: [
          { id: A, name: '숲속의 갱단', is_active: true },
          { id: B, name: '새 트라이브', is_active: true },
        ],
      })
    )
    expect(group.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(group.match(/aria-checked="false"/g)).toHaveLength(1)
  })

  it('목록에 없는 트라이브 태그는 「(삭제됐거나 모르는 트라이브)」로 체크된 채 남는다', () => {
    const card = cardWith(['all', `tribe_${GONE}`])
    const group = tribeGroup(render({ card, tribes: [{ id: A, name: '숲속의 갱단', is_active: true }] }))
    expect(group).toContain('(삭제됐거나 모르는 트라이브)')
    expect(group.match(/aria-checked="true"/g)).toHaveLength(1)
  })

  it('목록이 비면 안내 문구를 보인다', () => {
    const group = tribeGroup(render({ tribes: [] }))
    expect(group).toContain('등록된 트라이브가 없어요')
    expect(group).not.toContain('role="checkbox"')
  })
})
