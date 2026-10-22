/**
 * 컬렉션 등급별 보상 편집기의 보기 (티켓 20261022_1139 2회)
 *
 * jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 훅 없는 표시 컴포넌트(`ItemBookTierRewardsView`)를 서버 렌더
 * (`renderToStaticMarkup`)로 그려 확인한다. 저장·조회 호출은 브라우저가 필요해 여기서 그리지 않는다(라우트 시험이 같은 규칙을 고정한다).
 *
 * 확인하는 것: 로딩·실패 상태, 등급 네 행의 순서와 기본값 안내, 저장해 둔 값(포인트 0과 빈 칸의 구분, 보상 배지 이름),
 * 포인트 글이 정수가 아닐 때와 같은 배지를 두 등급에 골랐을 때 안내와 저장 버튼 잠김, 이미 받은 보상은 바뀌지 않는다는 안내, 한국어 줄바꿈 클래스.
 * 서버 렌더는 이어 붙은 글자 사이에 `<!-- -->`를 끼우므로 주석을 지운 글로 비교한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/itembooks/__tests__/ItemBookTierRewards.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ItemBookTierRewardsView,
  blockingReasons,
  draftsFromRows,
  type ItemBookTierRewardsViewProps,
  type TierRewardDraft,
} from '../ItemBookTierRewards'
import type { TierRewardRow } from '@/lib/admin/itembookTierRewards'

const BADGE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BADGE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function rows(overrides: Partial<Record<TierRewardRow['tier'], Partial<TierRewardRow>>> = {}): TierRewardRow[] {
  const defaults = { common: 100, rare: 200, epic: 400, mystic: 800 } as const
  return (['common', 'rare', 'epic', 'mystic'] as const).map((tier) => ({
    tier,
    rewardPoints: null,
    defaultPoints: defaults[tier],
    rewardBadgeId: null,
    rewardBadgeName: null,
    ...overrides[tier],
  }))
}

function render(overrides: Partial<ItemBookTierRewardsViewProps> = {}): string {
  const baseRows = overrides.rows ?? rows()
  const props: ItemBookTierRewardsViewProps = {
    status: 'ready',
    loadError: null,
    rows: baseRows,
    drafts: draftsFromRows(baseRows),
    version: 1,
    busy: false,
    saveError: null,
    onPointsChange: () => undefined,
    onBadgeChange: () => undefined,
    onSave: () => undefined,
    onRetry: () => undefined,
    ...overrides,
  }
  return renderToStaticMarkup(<ItemBookTierRewardsView {...props} />).replace(/<!-- -->/g, '')
}

/** 라벨이 정확히 일치하는 버튼 태그를 찾는다 */
function button(out: string, label: string): string {
  const match = out.match(new RegExp(`<button[^>]*>${label}</button>`))
  if (!match) throw new Error(`버튼 «${label}»을 찾지 못했어요`)
  return match[0]
}

describe('draftsFromRows', () => {
  it('저장된 포인트는 글로, 비운 포인트와 보상 배지는 빈 글로 바꾼다. 0은 0으로 남는다', () => {
    const drafts = draftsFromRows(rows({ rare: { rewardPoints: 0, rewardBadgeId: BADGE_A }, epic: { rewardPoints: 900 } }))
    expect(drafts).toEqual([
      { tier: 'common', points: '', badgeId: '' },
      { tier: 'rare', points: '0', badgeId: BADGE_A },
      { tier: 'epic', points: '900', badgeId: '' },
      { tier: 'mystic', points: '', badgeId: '' },
    ])
  })
})

describe('blockingReasons', () => {
  const draft = (tier: TierRewardDraft['tier'], points = '', badgeId = ''): TierRewardDraft => ({ tier, points, badgeId })

  it('막을 이유가 없으면 blocked가 아니다', () => {
    const result = blockingReasons([draft('common', '10'), draft('rare', '0', BADGE_A), draft('epic', '', BADGE_B), draft('mystic')])
    expect(result).toEqual({ invalidPointTiers: [], duplicates: [], blocked: false })
  })

  it('정수가 아닌 포인트와 겹치는 배지를 모은다', () => {
    const result = blockingReasons([draft('common', '1.5'), draft('rare', '', BADGE_A), draft('epic', '-3', BADGE_A), draft('mystic')])
    expect(result.invalidPointTiers).toEqual(['common', 'epic'])
    expect(result.duplicates).toEqual([{ badgeId: BADGE_A, tiers: ['rare', 'epic'] }])
    expect(result.blocked).toBe(true)
  })
})

describe('ItemBookTierRewardsView — 로딩·실패', () => {
  it('로딩 중에는 안내와 자리 표시만 있고 저장 버튼이 없다', () => {
    const out = render({ status: 'loading', rows: [], drafts: [] })
    expect(out).toContain('등급별 보상을 불러오는 중이에요.')
    expect(out).toContain('aria-busy="true"')
    expect(out).not.toContain('등급별 보상 저장')
  })

  it('실패하면 이유와 다시 불러오기 버튼을 보이고 저장 버튼은 없다', () => {
    const out = render({ status: 'error', rows: [], drafts: [], loadError: '등급별 보상을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요.' })
    expect(out).toContain('등급별 보상을 보여 줄 수 없어요')
    expect(out).toContain('서버에서 조회 중 오류가 났어요.')
    expect(out).toContain('다시 불러오기')
    expect(out).not.toContain('등급별 보상 저장')
  })
})

describe('ItemBookTierRewardsView — 등급 네 행', () => {
  it('Common → Rare → Epic → Mystic 순서로 네 행을 보이고 각 포인트 칸의 안내에 기본값을 적는다', () => {
    const out = render()
    const order = ['common', 'rare', 'epic', 'mystic'].map((tier) => out.indexOf(`data-tier="${tier}"`))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(out).toContain('비우면 기본값 100포인트를 써요. 0이면 포인트를 주지 않아요.')
    expect(out).toContain('비우면 기본값 200포인트를 써요.')
    expect(out).toContain('비우면 기본값 400포인트를 써요.')
    expect(out).toContain('비우면 기본값 800포인트를 써요.')
    expect(out).toContain('placeholder="기본값 100"')
    expect(out).toContain('비우면 보상 배지를 주지 않아요.')
  })

  it('기본값을 읽지 못한 등급은 숫자 없이 «기본값»만 적는다', () => {
    const out = render({ rows: rows({ rare: { defaultPoints: null } }) })
    expect(out).toContain('비우면 기본값을 써요. 0이면 포인트를 주지 않아요.')
    expect(out).toContain('placeholder="기본값"')
  })

  it('저장해 둔 값을 보인다: 포인트 0과 빈 칸이 다르고 보상 배지 이름이 있다', () => {
    const out = render({ rows: rows({ rare: { rewardPoints: 0, rewardBadgeId: BADGE_A, rewardBadgeName: '레어 보상' }, mystic: { rewardPoints: 900 } }) })
    expect(out).toMatch(/id="itembook-tier-reward-rare-points"[^>]*value="0"/)
    expect(out).toMatch(/id="itembook-tier-reward-mystic-points"[^>]*value="900"/)
    expect(out).toMatch(/id="itembook-tier-reward-common-points"[^>]*value=""/)
    expect(out).toContain('value="레어 보상"')
  })

  it('이미 받은 보상은 바뀌지 않는다는 안내가 있다', () => {
    const out = render()
    expect(out).toContain('이미 받은 보상은 바뀌지 않아요.')
    expect(out).toContain('앞으로 등급을 완성하는 유저부터 적용되고')
  })

  it('막을 이유가 없으면 저장 버튼이 눌린다', () => {
    const out = render()
    expect(button(out, '등급별 보상 저장')).not.toContain('disabled=""')
    expect(out).not.toContain('빨간 안내를 먼저 고쳐 주세요.')
  })

  it('저장 중에는 버튼과 입력칸이 잠기고 문구가 바뀐다', () => {
    const out = render({ busy: true })
    expect(button(out, '저장하는 중')).toContain('disabled=""')
    expect(out).toMatch(/id="itembook-tier-reward-common-points"[^>]*disabled=""/)
  })

  it('저장이 거절되면 이유를 보이고 입력은 그대로다', () => {
    const out = render({ saveError: '보상을 저장하지 못했어요. 같은 배지를 Common·Epic에 골랐어요.' })
    expect(out).toContain('같은 배지를 Common·Epic에 골랐어요.')
    expect(out).toContain('등급별 보상 저장')
  })
})

describe('ItemBookTierRewardsView — 저장을 막는 입력', () => {
  it('포인트 글이 정수가 아니면 그 등급에 빨간 안내를 보이고 저장 버튼이 잠긴다', () => {
    const base = rows()
    const drafts = draftsFromRows(base).map((d) => (d.tier === 'epic' ? { ...d, points: '1.5' } : d))
    const out = render({ rows: base, drafts })
    expect(out).toContain('포인트는 0 이상의 정수로 써 주세요. 기본값을 쓰려면 비워 두세요.')
    expect(out).toMatch(/id="itembook-tier-reward-epic-points"[^>]*aria-invalid="true"/)
    expect(button(out, '등급별 보상 저장')).toContain('disabled=""')
    expect(out).toContain('빨간 안내를 먼저 고쳐 주세요.')
  })

  it('같은 배지를 두 등급에 고르면 어느 등급인지 보이고 저장 버튼이 잠긴다', () => {
    const base = rows({ rare: { rewardBadgeId: BADGE_A, rewardBadgeName: '보상' }, mystic: { rewardBadgeId: BADGE_A, rewardBadgeName: '보상' } })
    const out = render({ rows: base })
    expect(out).toContain('같은 배지를 두 등급에 골랐어요')
    expect(out).toContain('Mystic에서도 같은 배지를 골랐어요.')
    expect(out).toContain('Rare에서도 같은 배지를 골랐어요.')
    expect(button(out, '등급별 보상 저장')).toContain('disabled=""')
  })

  it('서로 다른 배지를 고르면 중복 안내가 없다', () => {
    const base = rows({ rare: { rewardBadgeId: BADGE_A, rewardBadgeName: 'A' }, mystic: { rewardBadgeId: BADGE_B, rewardBadgeName: 'B' } })
    const out = render({ rows: base })
    expect(out).not.toContain('같은 배지를 두 등급에 골랐어요')
    expect(button(out, '등급별 보상 저장')).not.toContain('disabled=""')
  })
})

describe('ItemBookTierRewardsView — 한국어 줄바꿈', () => {
  it('제목·문단·라벨에 줄바꿈 클래스가 붙는다', () => {
    const out = render()
    expect(out).toMatch(/<h2[^>]*class="[^"]*break-keep wrap-break-word text-balance/)
    expect(out).toMatch(/<p class="[^"]*break-keep wrap-break-word text-pretty/)
    expect(out).toMatch(/<button[^>]*class="[^"]*break-keep wrap-break-word whitespace-nowrap[^"]*"[^>]*>등급별 보상 저장/)
  })
})
