/**
 * 미션 양식 — 참가 대상·순위형 제한 안내·밤 조건 안전 안내·잠김 읽기 전용 표시 (티켓 20261019_1318 1회)
 *
 * 판정 자체는 `missionFormRules.ts`의 시험(`__tests__/missionFormRules.test.ts`)이 고정한다. 여기서는 그 판정이 화면에 연결됐는지만
 * 서버 렌더로 확인한다. jsdom이 없어(`vitest.config.ts` `environment: 'node'`) `renderToStaticMarkup`을 쓰고, 이어 붙은 글자 사이에 끼는
 * `<!-- -->`는 지운 글로 비교한다. 클릭·저장은 실제 DB를 바꾸는 동작이라 부르지 않는다.
 * 폴더 `__tests__`는 node:assert 시험 전용(vitest 제외)이라 이 파일은 양식 옆에 둔다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/missions/MissionForm.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import MissionForm from './MissionForm'
import { NIGHT_SAFETY_NOTICE, type MissionFormTribe } from './missionFormRules'
import type { MissionRow } from '@/types/database'

type Props = Parameters<typeof MissionForm>[0]

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const tribes: MissionFormTribe[] = [
  { id: A, name: '러너', isActive: true, sortOrder: 1 },
  { id: B, name: '라이더', isActive: true, sortOrder: 2 },
  { id: C, name: '옛 트라이브', isActive: false, sortOrder: 3 },
]

function render(overrides: Partial<Props> = {}): string {
  const props: Props = { badgeLabels: [], tribes, ...overrides }
  return renderToStaticMarkup(<MissionForm {...props} />).replace(/<!-- -->/g, '')
}

function mission(overrides: Record<string, unknown> = {}): MissionRow {
  return {
    id: 'mission-1',
    title: '테스트 미션',
    description: null,
    condition_text: null,
    mission_type: 'distance',
    condition_json: { distance_km: 10 },
    reward_badge_ids: [],
    reward_points: 0,
    status_display_type: 'achievement',
    visible_rank_count: null,
    gated_badge_id: null,
    starts_at: '2026-10-21T00:00:00.000Z',
    ends_at: null,
    max_completions: null,
    image_url: null,
    image_source: null,
    exposure_mode: 'start_date',
    exposure_at: null,
    ...overrides,
  } as unknown as MissionRow
}

const NIGHT_RANKING = mission({
  mission_type: 'engine_condition',
  status_display_type: 'ranking',
  condition_json: { activity_type: 'running', time_range: { start: '22:00', end: '05:00' } },
})

describe('MissionForm — 참가 대상', () => {
  it('새 미션은 공통 미션으로 시작하고 트라이브 체크 목록을 그리지 않는다', () => {
    const out = render()

    expect(out).toContain('참가 대상')
    expect(out).toContain('aria-label="미션 종류"')
    expect(out).toContain('모든 유저가 보고 참가해요.')
    expect(out).not.toContain('role="group"')
    expect(out).not.toContain('참가 허용')
    // 새 미션에는 «줄일 수 없다»는 수정 화면 안내가 없다
    expect(out).not.toContain('트라이브를 줄일 수 없어요')
  })

  it('허용 트라이브가 있는 미션은 트라이브 미션으로 열고, 고른 트라이브만 체크되어 있다', () => {
    const out = render({ mission: mission(), allowedTribeIds: [A] })

    expect(out).toContain('고른 트라이브의 유저만 미션을 보고 참가해요.')
    expect(out).toMatch(/aria-checked="true"[^>]*aria-label="러너 참가 허용"/)
    expect(out).toMatch(/aria-checked="false"[^>]*aria-label="라이더 참가 허용"/)
    expect(out).toContain('이미 참가하거나 완료한 유저가 있으면 참가할 수 있는 트라이브를 줄일 수 없어요')
  })

  it('활성 트라이브가 먼저 나오고 비활성 트라이브는 표기한다', () => {
    const out = render({ mission: mission(), allowedTribeIds: [C] })

    expect(out).toContain('옛 트라이브 (비활성)')
    expect(out.indexOf('러너')).toBeLessThan(out.indexOf('옛 트라이브 (비활성)'))
    expect(out.indexOf('라이더')).toBeLessThan(out.indexOf('옛 트라이브 (비활성)'))
  })

  it('허용 트라이브가 없는 기존 미션은 공통 미션으로 연다', () => {
    const out = render({ mission: mission(), allowedTribeIds: [] })

    expect(out).toContain('모든 유저가 보고 참가해요.')
    expect(out).not.toContain('참가 허용')
  })
})

describe('MissionForm — 순위형 제한 안내와 밤 조건 안전 안내', () => {
  it('랭킹형으로 정해진 채 밤 조건이면 이유와 «바꿔야 저장할 수 있다»를 보이고, 안전 안내도 붙는다', () => {
    const out = render({ mission: NIGHT_RANKING })

    expect(out).toContain('밤 조건은 순위를 올리려고 늦은 밤에 무리해서 움직이게 만들 수 있어서 랭킹형을 고를 수 없어요.')
    expect(out).toContain('지금 랭킹형으로 정해져 있어서, 달성형이나 개인형으로 바꿔야 저장할 수 있어요.')
    expect(out).toContain(NIGHT_SAFETY_NOTICE)
    // 안내가 있으면 «추천: 랭킹형»은 보이지 않는다
    expect(out).not.toContain('추천: 랭킹형')
  })

  it('달성형이면 이유만 보이고 «바꿔야 저장할 수 있다»는 없다. 안전 안내는 그대로 붙는다', () => {
    const out = render({ mission: { ...NIGHT_RANKING, status_display_type: 'achievement' } as MissionRow })

    expect(out).toContain('랭킹형을 고를 수 없어요.')
    expect(out).not.toContain('바꿔야 저장할 수 있어요')
    expect(out).toContain(NIGHT_SAFETY_NOTICE)
  })

  it('캡슐 연 횟수 조건은 캡슐 이유를 보이고 밤 안전 안내는 붙이지 않는다', () => {
    const out = render({
      mission: mission({ mission_type: 'engine_condition', status_display_type: 'individual', condition_json: { capsule_open_count: 3 } }),
    })

    expect(out).toContain('캡슐 연 횟수는 캡슐을 빨리 채워 주는 상품이 생기면')
    expect(out).not.toContain(NIGHT_SAFETY_NOTICE)
  })

  it('막힐 조건이 없으면 안내 없이 추천 문구만 보인다', () => {
    const out = render({ mission: mission({ status_display_type: 'ranking' }) })

    expect(out).toContain('추천: 랭킹형')
    expect(out).not.toContain('랭킹형을 고를 수 없어요')
    expect(out).not.toContain(NIGHT_SAFETY_NOTICE)
  })
})

describe('MissionForm — 잠김으로 만든 아이템 배지(읽기 전용)', () => {
  const badgeLabels = [
    { id: 'b-open', name: '주말 러너', rarity: 'rare', type: 'item', point_reward: 0, always_locked: false },
    { id: 'b-locked', name: '비밀 장갑', rarity: 'epic', type: 'item', point_reward: 0, always_locked: true },
  ]

  it('보상 배지 중 잠김으로 만든 배지는 칩에 표시하고 어느 배지인지 안내한다', () => {
    const out = render({ mission: mission({ reward_badge_ids: ['b-open', 'b-locked'] }), badgeLabels })

    expect(out).toContain('잠김으로 만든 아이템 배지: 비밀 장갑.')
    expect(out).toContain('받는 유저는 이 배지를 잠긴 채로 받아요.')
    // 칩에는 «잠김» 표시가 한 번만 붙는다(열린 배지에는 없다)
    expect(out.match(/title="잠김으로 만든 아이템 배지"/g)).toHaveLength(1)
  })

  it('잠긴 배지가 없으면 표시도 안내도 없다', () => {
    const out = render({ mission: mission({ reward_badge_ids: ['b-open'] }), badgeLabels })

    expect(out).not.toContain('잠김으로 만든 아이템 배지')
  })
})
