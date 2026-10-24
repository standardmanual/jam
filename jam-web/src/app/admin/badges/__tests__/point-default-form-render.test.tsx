/**
 * 어드민 배지 폼 — 포인트 칸의 처음 모습 (티켓 20261022_1135 1회)
 *
 * 서버에서 한 번 그려 보고 처음 화면의 값과 칸 안내를 고정한다(클릭·입력은 같은 폴더의 `point-default-form-contract.test.ts`가 소스로 고정한다).
 *  - 새 배지: 포인트 칸이 일괄 값(Common 10)으로 채워져 있고, 일괄 값을 바꾸면 칸도 바뀐다. 칸 안내에 «이 등급의 기본값은 N포인트예요»가 보인다.
 *  - 기존 배지 수정: 저장된 값을 그대로 보이고(등급의 기본값과 달라도), 칸 안내에 그 등급의 기본값만 보인다.
 *  - 레벨형 배지: 칸 안내가 «레벨형의 기본값»이고 값은 레벨형 값이다. 숨김 배지: 0으로 고정되고 기본값 안내는 없다.
 * 실제 DB·네트워크를 부르지 않는다(effect는 서버 렌더에서 돌지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/badges/__tests__/point-default-form-render.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/badges/new',
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import BadgeForm from '../BadgeForm'
import { DEFAULT_BADGE_POINT_POLICY } from '@/lib/badge/pointPolicy'
import type { BadgeRow } from '@/types/database'

type Props = ComponentProps<typeof BadgeForm>

const BASE: Props = {
  tribes: [],
  itemBooks: [],
  poiCategories: [],
  lockedMinimums: { common: 30, rare: 60, epic: 120, mystic: 240 },
  pointPolicy: DEFAULT_BADGE_POINT_POLICY,
}

const render = (props: Partial<Props> = {}) => renderToStaticMarkup(<BadgeForm {...BASE} {...props} />).replace(/<!-- -->/g, '')

/** 포인트 칸의 값 */
const pointValue = (html: string) => /id="badge-point-reward"[^>]*value="([^"]*)"/.exec(html)?.[1]

function badge(overrides: Partial<BadgeRow> = {}): BadgeRow {
  return {
    id: 'b1',
    name: '녹슨 열쇠',
    description: '설명',
    type: 'activity',
    rarity: 'common',
    level: null,
    family_key: null,
    image_url: 'https://cdn.test/x.webp',
    activity_types: ['running'],
    patch_available: false,
    patch_price_krw: null,
    condition_json: null,
    point_reward: 0,
    is_hidden: false,
    branch_key: null,
    ...overrides,
  } as unknown as BadgeRow
}

describe('새 배지의 포인트 칸', () => {
  it('일괄 값(Common 10)으로 채워져 있고 칸 안내가 이 등급의 기본값을 말한다', () => {
    const html = render()
    expect(pointValue(html)).toBe('10')
    expect(html).toContain('이 등급의 기본값은 10포인트예요.')
  })

  it('일괄 값을 바꾸면 처음 값과 칸 안내도 바뀐다', () => {
    const html = render({ pointPolicy: { ...DEFAULT_BADGE_POINT_POLICY, common_points: 15 } })
    expect(pointValue(html)).toBe('15')
    expect(html).toContain('이 등급의 기본값은 15포인트예요.')
  })
})

describe('기존 배지 수정의 포인트 칸', () => {
  it('저장된 값을 그대로 보이고, 칸 안내에는 그 등급의 기본값만 보인다', () => {
    const html = render({ badge: badge({ rarity: 'epic', point_reward: 7 }) })
    expect(pointValue(html)).toBe('7')
    expect(html).toContain('이 등급의 기본값은 50포인트예요.')
  })

  it('저장된 값이 0이어도 기본값으로 바꾸지 않는다', () => {
    const html = render({ badge: badge({ rarity: 'rare', point_reward: 0 }) })
    expect(pointValue(html)).toBe('0')
    expect(html).toContain('이 등급의 기본값은 20포인트예요.')
  })

  it('저장된 값이 비어 있으면(null) 예전처럼 0이다', () => {
    const html = render({ badge: badge({ rarity: 'rare', point_reward: null as unknown as number }) })
    expect(pointValue(html)).toBe('0')
  })

  it('레벨형 배지는 칸 안내가 레벨형의 기본값이고 저장된 값을 유지한다', () => {
    const html = render({ badge: badge({ rarity: null as unknown as BadgeRow['rarity'], level: 3, point_reward: 4 }) })
    expect(pointValue(html)).toBe('4')
    expect(html).toContain('레벨형의 기본값은 10포인트예요.')
  })

  it('숨김 배지는 0으로 고정된 안내만 보이고 기본값 안내는 없다', () => {
    const html = render({ badge: badge({ is_hidden: true, point_reward: 0 }) })
    expect(pointValue(html)).toBe('0')
    expect(html).toContain('숨김 배지는 포인트를 지급하지 않아요. 0으로 고정돼요.')
    expect(html).not.toContain('기본값은')
  })
})
