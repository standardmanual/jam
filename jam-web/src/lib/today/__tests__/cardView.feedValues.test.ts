/**
 * 새 카드 갈래의 값 칩 입력 연결 (티켓 20261121_0155, 상위 20261120_2026 4회차-4)
 *
 * 확인하는 것: ① 미션 조건 값(`resolved_mission.condition_json`)과 배지 달성 기준·레벨(`resolved_badges[0].condition_json`·`level`)이 새 갈래의 칩 문구로 나온다,
 * ② 값이 없으면 그 칩만 없다(구분 칩은 그대로), ③ 저장된 칩(`source`)이 새 출처 키를 읽는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.feedValues.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedBadge, ResolvedMission, TodayCardWithHref } from '../cards'
import { toCardView, type FeedCardView } from '../cardView'

const NOW = new Date('2026-11-21T12:00:00+09:00')

const MISSION: ResolvedMission = {
  starts_at: '2026-11-01T00:00:00+09:00',
  ends_at: null,
  reward_points: null,
  reward_badge_count: 0,
  image_url: null,
}

function badge(overrides: Partial<ResolvedBadge> = {}): ResolvedBadge {
  return { id: 'b1', name: '높은 곳 배지', image_url: 'https://cdn.example/b1.png', rarity: 'rare', earned: false, ...overrides }
}

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'mission_spotlight',
    layout_type: 'large_thumbnail',
    title: '낙엽 소리 따라 걷는 한 주',
    subtitle: null,
    cover_image_url: 'https://cdn.example/cover.png',
    badge_ids: [],
    mission_id: 'm1',
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-11-01T00:00:00+09:00',
    ends_at: '2026-11-30T23:59:59+09:00',
    sort_order: 3,
    is_active: true,
    created_at: '2026-10-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: 'T05',
    image_source: null,
    description: '먼저 참가하고 바스락 소리를 따라 걸어 봐요.',
    shape: 'hero',
    title_in_image: null,
    resolved_href: '/missions/m1',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: MISSION,
    resolved_collection: null,
    feed_type: 'hero_box',
    ...overrides,
  }
}

function feed(overrides: Partial<TodayCardWithHref> = {}): FeedCardView {
  const view = toCardView(makeCard(overrides), { now: NOW })
  if (!('feedType' in view)) throw new Error('새 갈래가 아니다')
  return view
}

const texts = (view: FeedCardView) => view.look.chips.map((chip) => chip.text)

describe('미션 조건 값 칩', () => {
  it('기간·보상 칩이 없으면 조건 값이 값 칩이 된다(걷기 8km → 구분 칩 «미션»)', () => {
    const view = feed({ resolved_mission: { ...MISSION, condition_json: { activity_type: 'walking', distance_km: 8 } } })
    expect(texts(view)).toEqual(['걷기 8km', '미션'])
  })

  it('조건 값이 없으면 그 칩만 없다(구분 칩만 남는다)', () => {
    expect(texts(feed())).toEqual(['미션'])
  })

  it('저장된 값 칩이 `mission.condition`을 읽는다', () => {
    const view = feed({
      resolved_mission: { ...MISSION, condition_json: { streak_days: 7 } },
      chips: [{ kind: 'value', source: 'mission.condition' }],
    })
    expect(texts(view)).toEqual(['7일 연속'])
    // 값이 없으면 저장된 칩도 만들지 않는다
    expect(texts(feed({ chips: [{ kind: 'value', source: 'mission.condition' }] }))).toEqual([])
  })

  it('기간 칩이 먼저다: 종료가 7일 이내면 남은 기간이 첫 값 칩이다', () => {
    const view = feed({
      resolved_mission: { ...MISSION, ends_at: '2026-11-23T12:00:00+09:00', condition_json: { distance_km: 8 } },
    })
    expect(texts(view)).toEqual(['2일 남음', '미션'])
  })
})

describe('액티비티 배지 달성 기준·레벨 값 칩', () => {
  const badgeCard = (badges: ResolvedBadge[], overrides: Partial<TodayCardWithHref> = {}) =>
    feed({ template_type: 'badge_spotlight', feed_type: 'badge_intro', mission_id: null, resolved_mission: null, resolved_badges: badges, ...overrides })

  it('카드에 걸린 첫 배지의 달성 기준이 값 칩이 된다', () => {
    expect(texts(badgeCard([badge({ condition_json: { elevation_gain_m: 700 } })]))).toEqual(['고도 700m', '액티비티 배지'])
  })

  it('달성 기준이 없고 레벨만 있으면 레벨 칩이다', () => {
    expect(texts(badgeCard([badge({ level: 2 })]))).toEqual(['Lv.2', '액티비티 배지'])
  })

  it('값이 없으면 구분 칩만 남는다', () => {
    expect(texts(badgeCard([badge()]))).toEqual(['액티비티 배지'])
    expect(texts(badgeCard([]))).toEqual(['액티비티 배지'])
  })

  it('저장된 값 칩이 `activity_badge.criteria`·`activity_badge.level`을 읽는다', () => {
    const view = badgeCard([badge({ condition_json: { elevation_gain_m: 700 }, level: 3 })], {
      chips: [
        { kind: 'value', source: 'activity_badge.criteria' },
        { kind: 'value', source: 'activity_badge.level' },
      ],
    })
    expect(texts(view)).toEqual(['고도 700m', 'Lv.3'])
  })
})
