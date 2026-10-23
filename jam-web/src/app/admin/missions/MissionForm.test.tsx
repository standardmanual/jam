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

const poiCategories = [
  { slug: 'train_subway', label: '지하철역' },
  { slug: 'cafe', label: '카페' },
]

function render(overrides: Partial<Props> = {}): string {
  const props: Props = { badgeLabels: [], tribes, poiCategories, ...overrides }
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

describe('MissionForm — 시간대·요일·계절·운동 속성 입력 칸 (티켓 20261021_1114 1회)', () => {
  const FULL = {
    activity_type: 'running',
    time_range: { start: '05:00', end: '08:00' },
    day_of_week: ['saturday', 'sunday'],
    weekly_streak: 4,
    season: 'summer',
    season_count: 3,
    season_count_all: 2,
    distinct_time_bands: 3,
    weekend_duration_hours: 2.5,
    cumulative_duration_hours: 10,
    max_speed_kmh: 30,
    avg_heartrate_bpm: 150,
    avg_watts: 200,
    avg_cadence: 80,
  }

  function engine(condition: Record<string, unknown>): MissionRow {
    return mission({ mission_type: 'engine_condition', status_display_type: 'individual', condition_json: condition })
  }

  it('12개 키가 모두 든 미션은 입력 칸마다 기존 값을 채워 열고, 입력 칸이 없다는 보존 안내를 띄우지 않는다', () => {
    const out = render({ mission: engine(FULL) })

    expect(out).not.toContain('값이 이미 설정돼 있어요')
    expect(out).toMatch(/id="mc-eng-timeStart"[^>]*value="05:00"/)
    expect(out).toMatch(/id="mc-eng-timeEnd"[^>]*value="08:00"/)
    expect(out).toMatch(/id="mc-eng-seasonCount"[^>]*value="3"/)
    expect(out).toMatch(/id="mc-eng-seasonCountAll"[^>]*value="2"/)
    expect(out).toMatch(/id="mc-eng-distinctTimeBands"[^>]*value="3"/)
    expect(out).toMatch(/id="mc-eng-weekendDurationHours"[^>]*value="2.5"/)
    expect(out).toMatch(/id="mc-eng-cumulativeDurationHours"[^>]*value="10"/)
    expect(out).toMatch(/id="mc-eng-maxSpeedKmh"[^>]*value="30"/)
    expect(out).toMatch(/id="mc-eng-avgHeartrateBpm"[^>]*value="150"/)
    expect(out).toMatch(/id="mc-eng-avgWatts"[^>]*value="200"/)
    expect(out).toMatch(/id="mc-eng-avgCadence"[^>]*value="80"/)
  })

  it('시간대는 시작·끝을 한 묶음으로 그리고, 요일은 월~일 칩을 그린다', () => {
    const out = render({ mission: engine(FULL) })

    expect(out).toContain('활동 시작 시간대')
    expect(out).toContain('aria-labelledby="mc-eng-timeStart-pair"')
    expect(out).toContain('활동 요일')
    // 칩마다 체크 상태가 «체크 상자 → 글자» 순서로 붙는다(한 칩의 `</label>`을 넘지 않는다). 토·일만 체크되어 열린다.
    // 같은 월~일 칩이 «서로 다른 요일 수» 칸에도 있어서 «활동 요일» 칸부터 읽는다
    const dayField = out.slice(out.indexOf('활동 요일'))
    const chipState = (label: string) =>
      dayField.match(new RegExp(`data-state="(checked|unchecked)"(?:(?!</label>)[\\s\\S])*?/>${label}</label>`))?.[1]
    for (const label of ['월', '화', '수', '목', '금']) expect(chipState(label), label).toBe('unchecked')
    for (const label of ['토', '일']) expect(chipState(label), label).toBe('checked')
  })

  it('수치 칸에는 배지 양식과 같은 범위를 건다 (서로 다른 시간대 2~6개, 평균 파워 0~2000W)', () => {
    const out = render({ mission: engine({ distance_km: 10 }) })

    expect(out).toMatch(/id="mc-eng-distinctTimeBands"[^>]*min="2"[^>]*max="6"/)
    expect(out).toMatch(/id="mc-eng-avgWatts"[^>]*min="0"[^>]*max="2000"/)
  })

  it('DB 기록 키는 2회에서 입력 칸이 생겨 보존 안내 대신 칸에 값을 채워 연다', () => {
    const out = render({ mission: engine({ capsule_open_count: 3 }) })

    expect(out).not.toContain('값이 이미 설정돼 있어요')
    expect(out).toMatch(/id="mc-eng-capsuleOpenCount"[^>]*value="3"/)
  })
})

describe('MissionForm — 기록으로 세는 조건 입력 칸 (티켓 20261021_1114 2회)', () => {
  const RECIPE = '00000000-0000-0000-0000-0000000000aa'
  const ALL = {
    combine_attempt_count: 10,
    combine_success_count: 5,
    combine_fail_count: 3,
    recipe_first_success: { recipe_id: RECIPE },
    cross_tribe_combine_success_count: 2,
    drop_item_count: 4,
    pickup_item_count: 6,
    pickup_from_user_count: 2,
    picked_up_by_user_count: 3,
    mission_complete_count: 3,
    collection_complete_count: 1,
    capsule_open_count: 7,
    locked_item_open_count: 2,
    locked_item_pickup_count: 1,
    weekly_active_days: 4,
    same_spot_checkin_days: 12,
    new_checkin_badge_count: 5,
    checkin_category_count: { category: 'train_subway', count: 2 },
    checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 1 },
    jam_period_earned: 300,
  }

  function engine(condition: Record<string, unknown>): MissionRow {
    return mission({ mission_type: 'engine_condition', status_display_type: 'individual', condition_json: condition })
  }

  it('복합 조건 미션은 「기록으로 세는 조건」 구역과 한 줄 설명, 소제목 6개를 정해진 순서로 그린다', () => {
    const out = render({ mission: engine({ distance_km: 10 }) })

    expect(out).toContain('기록으로 세는 조건')
    expect(out).toContain('참가한 뒤 미션 기간 안의 기록만 세요.')
    const titles = ['믹스', '드랍·픽업', '완료 수', '캡슐·잠긴 아이템 배지', '날짜·체크인', '잼']
    const area = out.slice(out.indexOf('기록으로 세는 조건'))
    // 소제목은 각자 묶음의 라벨(aria-labelledby)이다. 같은 글자가 다른 곳에 있어도 묶음 id로 순서를 확인한다
    const positions = titles.map((_, i) => area.indexOf(`id="mc-db-group-${i}"`))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    titles.forEach((title, i) => {
      expect(area).toMatch(new RegExp(`id="mc-db-group-${i}"[^>]*>${title}</p>`))
    })
  })

  it('복합 조건이 아니면 「기록으로 세는 조건」 구역을 그리지 않는다', () => {
    const out = render({ mission: mission() })

    expect(out).not.toContain('기록으로 세는 조건')
    expect(out).not.toContain('mc-db-group-')
  })

  it('20개 키가 든 미션은 입력 칸마다 기존 값을 채워 열고 보존 안내를 띄우지 않는다', () => {
    const out = render({ mission: engine(ALL) })

    expect(out).not.toContain('값이 이미 설정돼 있어요')
    const valueOf = (id: string, value: string) => expect(out).toMatch(new RegExp(`id="mc-eng-${id}"[^>]*value="${value}"`))
    valueOf('combineAttemptCount', '10')
    valueOf('combineSuccessCount', '5')
    valueOf('combineFailCount', '3')
    valueOf('recipeFirstSuccessRecipeId', RECIPE)
    valueOf('crossTribeCombineSuccessCount', '2')
    valueOf('dropItemCount', '4')
    valueOf('pickupItemCount', '6')
    valueOf('pickupFromUserCount', '2')
    valueOf('pickedUpByUserCount', '3')
    valueOf('missionCompleteCount', '3')
    valueOf('collectionCompleteCount', '1')
    valueOf('capsuleOpenCount', '7')
    valueOf('lockedItemOpenCount', '2')
    valueOf('lockedItemPickupCount', '1')
    valueOf('weeklyActiveDays', '4')
    valueOf('sameSpotCheckinDays', '12')
    valueOf('newCheckinBadgeCount', '5')
    valueOf('checkinCategoryCountCount', '2')
    valueOf('checkinBadgeCountNames', '성수역, 왕십리역')
    valueOf('checkinBadgeCountCount', '1')
    valueOf('jamPeriodEarned', '300')
    // 장소 카테고리는 선택 칸이다
    expect(out).toContain('id="mc-eng-checkinCategoryCountCategory"')
  })

  it('수치 칸에는 라벨·단위·범위를 건다 (주간 활동일 1~7일, 모은 잼 1~1,000,000잼, 체크인 개수 1~1,000,000개)', () => {
    const out = render({ mission: engine({ distance_km: 10 }) })

    expect(out).toMatch(/id="mc-eng-weeklyActiveDays"[^>]*min="1"[^>]*max="7"/)
    expect(out).toMatch(/id="mc-eng-sameSpotCheckinDays"[^>]*min="1"[^>]*max="3650"/)
    expect(out).toMatch(/id="mc-eng-newCheckinBadgeCount"[^>]*min="1"[^>]*max="100000"/)
    expect(out).toMatch(/id="mc-eng-combineSuccessCount"[^>]*min="1"[^>]*max="1000000"/)
    expect(out).toMatch(/id="mc-eng-jamPeriodEarned"[^>]*min="1"[^>]*max="1000000"/)
    // 레지스트리에 범위가 없는 객체형 두 키의 안쪽 개수도 같은 범위를 건다
    expect(out).toMatch(/id="mc-eng-checkinCategoryCountCount"[^>]*min="1"[^>]*max="1000000"/)
    expect(out).toMatch(/id="mc-eng-checkinBadgeCountCount"[^>]*min="1"[^>]*max="1000000"/)
    expect(out).toContain('주간 활동일')
    expect(out).toContain('믹스 시도 횟수')
  })

  it('기간 동안 모은 잼은 사용자가 정한 라벨·단위·도움말로 그린다', () => {
    const out = render({ mission: engine({ distance_km: 10 }) })

    expect(out).toContain('기간 동안 모은 잼')
    expect(out).toMatch(/id="mc-eng-jamPeriodEarned-suffix"[^>]*>잼</)
    expect(out).toContain('참가한 뒤 미션 기간 안에 모은 잼만 세요. 참가 전에 모은 잼은 포함되지 않아요.')
  })

  it('배지 기준으로 적힌 레지스트리 도움말은 미션 말로 바꿔 보인다 («발급»·«가입한 날부터» 없이)', () => {
    const out = render({ mission: engine({ distance_km: 10 }) })

    expect(out).toContain('이 레시피를 가장 먼저 성공한 1명만 달성해요')
    expect(out).not.toContain('발급돼요')
    expect(out).not.toContain('가입한 날부터')
    // 바꾸지 않은 칸은 레지스트리 도움말 그대로다
    expect(out).toContain('서로 다른 아이템만 세요. 같은 아이템을 다시 놓아도 1개예요.')
  })

  it('기간을 걸 수 없는 키 5개는 입력 칸이 없다', () => {
    const out = render({ mission: engine({ distance_km: 10 }) })

    for (const id of ['jamTotalEarned', 'chapterReached', 'daysSinceSignup', 'otherTribeItemKindsCount', 'signupRecentActiveDays']) {
      expect(out).not.toContain(`id="mc-eng-${id}"`)
    }
    for (const label of ['가입 경과일', '최근 30일 활동일', '다른 트라이브 아이템 배지 종류 수']) {
      expect(out).not.toContain(label)
    }
  })

  it('복합 조건이 아닌 타입에 기록으로 세는 조건이 입력돼 있으면 경고 박스만 보인다 (값은 지우지 않는다)', () => {
    const out = render({ mission: mission({ condition_json: { distance_km: 10, capsule_open_count: 3 } }) })

    expect(out).toContain(
      '이 미션 타입에서는 기록으로 세는 조건이 저장되지 않아요. 저장하면 지금 입력한 조건이 지워져요. 조건을 남기려면 타입을 원래대로 되돌려 주세요.'
    )
    // 입력 칸 구역 자체는 복합 조건에서만 보인다
    expect(out).not.toContain('기록으로 세는 조건</p>')
    expect(out).not.toContain('id="mc-eng-capsuleOpenCount"')
  })

  it('경고는 기록으로 세는 조건이 입력돼 있을 때만 보인다', () => {
    const notice = '이 미션 타입에서는 기록으로 세는 조건이 저장되지 않아요'
    expect(render({ mission: mission() })).not.toContain(notice)
    expect(render({ mission: engine(ALL) })).not.toContain(notice)
    expect(render({ mission: engine({ distance_km: 10 }) })).not.toContain(notice)
    expect(render()).not.toContain(notice)
  })

  it('장소 카테고리는 선택 칸과 개수 칸 둘로 그린다 (선택지 목록 자체는 열어야 그려져 서버 렌더에는 없다)', () => {
    const out = render({ mission: engine({ checkin_category_count: { category: 'train_subway', count: 2 } }) })

    expect(out).toContain('장소 카테고리')
    expect(out).toMatch(/<button[^>]*role="combobox"[^>]*id="mc-eng-checkinCategoryCountCategory"[^>]*aria-label="장소 카테고리"/)
    expect(out).toMatch(/id="mc-eng-checkinCategoryCountCount"[^>]*value="2"/)
    expect(out).toContain('보유 개수')
  })
})
