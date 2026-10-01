/**
 * 홈피드 카드 표시 데이터 변환 (티켓 20261001_1357)
 *
 * 확인하는 것:
 * 1. `buildFacts` — 자원별 필수 정보를 최대 2줄로 만들고, 값이 없는 줄은 생략한다.
 *    남은 시간 경계(7일·24시간)와 KST 날짜 경계를 시각 값으로 고정한다.
 * 2. `toCardView` — 카드 ID·활성 여부·노출 기간·정렬 순서 없이 표시 데이터를 만들고,
 *    계측 정보(`tracking`)는 요청했을 때만 싣는다. 타일 0개 타일형은 `brief`가 된다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { TodayCardWithHref, ResolvedBadge } from '../cards'
import {
  CARD_RESOURCES,
  buildFacts,
  fallbackEmptyTileShape,
  formatKstMonthDay,
  resourceOfTemplate,
  toCardView,
  type CardView,
  type CardResource,
} from '../cardView'

// 판정 기준 시각: KST 2026-10-05 12:00 (= UTC 03:00)
const NOW = new Date('2026-10-05T12:00:00+09:00')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** 기준 시각에서 `ms` 뒤에 끝나는 기간 */
function endsIn(ms: number) {
  return { startsAt: '2026-10-01T00:00:00+09:00', endsAt: new Date(NOW.getTime() + ms).toISOString() }
}

describe('resourceOfTemplate — 템플릿 → 자원 대응', () => {
  it.each([
    ['mission_spotlight', 'mission'],
    ['drop_alert', 'drop'],
    ['badge_spotlight', 'badge'],
    ['editorial_article', 'article'],
    ['ranking_board', 'ranking'],
    ['itembook_milestone', 'collection'],
    ['progress_nudge', 'auto'],
    ['location_trend', 'auto'],
  ] as const)('%s → %s', (template, resource) => {
    expect(resourceOfTemplate(template)).toBe(resource)
  })

  it('recipe는 대응하는 템플릿이 아직 없다', () => {
    expect(CARD_RESOURCES).toContain('recipe')
    const mapped = (
      ['mission_spotlight', 'drop_alert', 'badge_spotlight', 'editorial_article', 'ranking_board', 'itembook_milestone', 'progress_nudge', 'location_trend'] as const
    ).map(resourceOfTemplate)
    expect(mapped).not.toContain('recipe')
  })
})

describe('formatKstMonthDay — KST 기준 날짜', () => {
  it('UTC 날짜가 아니라 KST 날짜로 읽는다(경계 1초 전후)', () => {
    expect(formatKstMonthDay('2026-10-11T14:59:59Z')).toBe('10월 11일') // KST 10-11 23:59:59
    expect(formatKstMonthDay('2026-10-11T15:00:00Z')).toBe('10월 12일') // KST 10-12 00:00:00
  })

  it('월·일의 앞자리 0을 붙이지 않는다', () => {
    expect(formatKstMonthDay('2026-01-04T00:00:00+09:00')).toBe('1월 4일')
  })

  it('읽을 수 없는 값이면 null이다', () => {
    expect(formatKstMonthDay('not-a-date')).toBeNull()
  })
})

describe('buildFacts — 미션', () => {
  const period = { startsAt: '2026-10-12T00:00:00+09:00', endsAt: '2026-11-08T23:59:59+09:00' }

  it('기간과 보상을 두 줄로 만든다(예: 기간 10월 12일~11월 8일, 보상 300 포인트 · 배지 1개)', () => {
    expect(buildFacts('mission', { period, rewardPoints: 300, rewardBadgeCount: 1 }, NOW)).toEqual([
      '기간 10월 12일~11월 8일',
      '보상 300 포인트 · 배지 1개',
    ])
  })

  it('종료가 없으면 「기간 상시」다', () => {
    expect(buildFacts('mission', { period: { startsAt: period.startsAt, endsAt: null }, rewardPoints: 300 }, NOW)).toEqual([
      '기간 상시',
      '보상 300 포인트',
    ])
  })

  it('보상은 있는 것만 쓴다(포인트만, 배지만)', () => {
    expect(buildFacts('mission', { period, rewardPoints: 300, rewardBadgeCount: 0 }, NOW)[1]).toBe('보상 300 포인트')
    expect(buildFacts('mission', { period, rewardPoints: 0, rewardBadgeCount: 2 }, NOW)[1]).toBe('보상 배지 2개')
    expect(buildFacts('mission', { period, rewardPoints: null, rewardBadgeCount: 1 }, NOW)[1]).toBe('보상 배지 1개')
  })

  it('포인트는 천 단위로 쉼표를 찍는다', () => {
    expect(buildFacts('mission', { period, rewardPoints: 1500 }, NOW)[1]).toBe('보상 1,500 포인트')
  })

  it('보상이 없으면 그 줄만 생략한다', () => {
    expect(buildFacts('mission', { period, rewardPoints: 0, rewardBadgeCount: 0 }, NOW)).toEqual(['기간 10월 12일~11월 8일'])
    expect(buildFacts('mission', { period }, NOW)).toEqual(['기간 10월 12일~11월 8일'])
  })

  it('기간 값이 없으면 기간 줄만 생략한다', () => {
    expect(buildFacts('mission', { period: null, rewardPoints: 300 }, NOW)).toEqual(['보상 300 포인트'])
  })

  it('시작·종료 날짜는 KST 기준이다(종료 23:59:59 KST는 그날, 00:00 KST는 다음 날)', () => {
    const kstEndOfDay = buildFacts('mission', { period: { startsAt: '2026-10-11T15:00:00Z', endsAt: '2026-11-08T14:59:59Z' } }, NOW)
    expect(kstEndOfDay).toEqual(['기간 10월 12일~11월 8일'])
    const kstNextDay = buildFacts('mission', { period: { startsAt: '2026-10-11T14:59:59Z', endsAt: '2026-11-08T15:00:00Z' } }, NOW)
    expect(kstNextDay).toEqual(['기간 10월 11일~11월 9일'])
  })

  it('읽을 수 없는 날짜면 기간 줄을 만들지 않는다', () => {
    expect(buildFacts('mission', { period: { startsAt: 'x', endsAt: '2026-11-08T00:00:00+09:00' }, rewardPoints: 300 }, NOW)).toEqual([
      '보상 300 포인트',
    ])
  })
})

describe('buildFacts — 남은 시간 (종료 7일 이내, 기간 줄 대신)', () => {
  const faces = (ms: number) => buildFacts('mission', { period: endsIn(ms), rewardPoints: 300 }, NOW)

  it('7일 경계: 정확히 7일 남으면 「7일 남음」, 1밀리초라도 더 길면 기간을 쓴다', () => {
    expect(faces(7 * DAY)[0]).toBe('7일 남음')
    expect(faces(7 * DAY + 1)[0]).toMatch(/^기간 /)
  })

  it('24시간 경계: 24시간 이내는 시간, 그보다 길면 일 단위다(24시간 = 1일)', () => {
    expect(faces(24 * HOUR)[0]).toBe('24시간 남음')
    expect(faces(24 * HOUR + 1)[0]).toBe('1일 남음')
  })

  it('일은 내림이다(1일 23시간 59분 → 1일, 정확히 2일 → 2일)', () => {
    expect(faces(2 * DAY - 1)[0]).toBe('1일 남음')
    expect(faces(2 * DAY)[0]).toBe('2일 남음')
    expect(faces(6 * DAY + 23 * HOUR)[0]).toBe('6일 남음')
  })

  it('시간은 올림이고 0시간 남음은 없다(1분 → 1시간, 1시간 → 1시간, 1시간 1밀리초 → 2시간)', () => {
    expect(faces(60 * 1000)[0]).toBe('1시간 남음')
    expect(faces(HOUR)[0]).toBe('1시간 남음')
    expect(faces(HOUR + 1)[0]).toBe('2시간 남음')
    expect(faces(23 * HOUR + 30 * 60 * 1000)[0]).toBe('24시간 남음')
  })

  it('이미 끝났거나 지금 끝나는 기간은 남은 시간 대신 기간 줄을 쓴다', () => {
    expect(faces(0)[0]).toMatch(/^기간 /)
    expect(faces(-HOUR)[0]).toMatch(/^기간 /)
  })

  it('남은 시간은 기간 줄을 대신할 뿐이고 보상 줄은 그대로다(최대 2줄)', () => {
    expect(faces(3 * DAY)).toEqual(['3일 남음', '보상 300 포인트'])
  })

  it('KST 자정 직전 종료: 기준 시각이 KST 2026-10-05 23:59:59이고 종료가 10-12 23:59:59면 정확히 7일이다', () => {
    const now = new Date('2026-10-05T23:59:59+09:00')
    const period = { startsAt: '2026-10-01T00:00:00+09:00', endsAt: '2026-10-12T23:59:59+09:00' }
    expect(buildFacts('mission', { period }, now)).toEqual(['7일 남음'])
    expect(buildFacts('mission', { period }, new Date(now.getTime() - 1))[0]).toMatch(/^기간 /)
  })

  it('종료가 없는 상시 미션에는 남은 시간이 없다', () => {
    expect(buildFacts('mission', { period: { startsAt: '2026-10-01T00:00:00+09:00', endsAt: null } }, NOW)).toEqual(['기간 상시'])
  })

  it('자동 카드가 가리키는 미션에도 같은 규칙이 적용된다', () => {
    expect(buildFacts('auto', { period: endsIn(2 * DAY + HOUR) }, NOW)).toEqual(['2일 남음'])
  })
})

describe('buildFacts — 그 밖의 자원', () => {
  it('드랍: 지역 한 줄(시각은 값이 없어 생략)', () => {
    expect(buildFacts('drop', { place: '한강공원' }, NOW)).toEqual(['지역 한강공원'])
  })

  it('드랍: 지역이 비었거나 공백이면 줄이 없다', () => {
    expect(buildFacts('drop', { place: '' }, NOW)).toEqual([])
    expect(buildFacts('drop', { place: '   ' }, NOW)).toEqual([])
    expect(buildFacts('drop', { place: null }, NOW)).toEqual([])
    expect(buildFacts('drop', {}, NOW)).toEqual([])
  })

  it('컬렉션: 이름과 「아이템 N개」', () => {
    expect(buildFacts('collection', { collectionName: '한강 컬렉션', itemCount: 12 }, NOW)).toEqual(['한강 컬렉션', '아이템 12개'])
  })

  it('컬렉션: 개수를 모르거나 0이면 이름만, 이름이 없으면 개수만', () => {
    expect(buildFacts('collection', { collectionName: '한강 컬렉션', itemCount: null }, NOW)).toEqual(['한강 컬렉션'])
    expect(buildFacts('collection', { collectionName: '한강 컬렉션', itemCount: 0 }, NOW)).toEqual(['한강 컬렉션'])
    expect(buildFacts('collection', { collectionName: ' ', itemCount: 3 }, NOW)).toEqual(['아이템 3개'])
  })

  it('JAM! 배지: 이름만(희귀도는 색 칩이라 글자 줄에 넣지 않는다)', () => {
    expect(buildFacts('badge', { badgeName: '한강 러너' }, NOW)).toEqual(['한강 러너'])
    expect(buildFacts('badge', { badgeName: null }, NOW)).toEqual([])
  })

  it('자동 카드: 미션을 가리키지 않으면 줄이 없다', () => {
    expect(buildFacts('auto', {}, NOW)).toEqual([])
    expect(buildFacts('auto', { period: null }, NOW)).toEqual([])
  })

  it.each(['article', 'ranking', 'recipe'] as CardResource[])('%s: 필수 정보 줄이 없다(다른 자원의 값이 들어와도 쓰지 않는다)', (resource) => {
    expect(
      buildFacts(resource, { period: endsIn(DAY), rewardPoints: 300, place: '한강', collectionName: '컬렉션', badgeName: '배지' }, NOW),
    ).toEqual([])
  })

  it('어떤 자원도 2줄을 넘기지 않는다', () => {
    const all = {
      period: endsIn(30 * DAY),
      rewardPoints: 300,
      rewardBadgeCount: 1,
      place: '한강',
      collectionName: '컬렉션',
      itemCount: 4,
      badgeName: '배지',
    }
    for (const resource of CARD_RESOURCES) expect(buildFacts(resource, all, NOW).length).toBeLessThanOrEqual(2)
  })
})

// ─── toCardView ───────────────────────────────────────────────────────────

function badge(id: string, overrides: Partial<ResolvedBadge> = {}): ResolvedBadge {
  return { id, name: `배지 ${id}`, image_url: `https://cdn.example/${id}.png`, rarity: 'rare', earned: true, ...overrides }
}

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '제목',
    subtitle: null,
    cover_image_url: 'https://cdn.example/cover.png',
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-10-01T00:00:00+09:00',
    ends_at: '2026-10-31T23:59:59+09:00',
    sort_order: 3,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: 'T05',
    image_source: null,
    description: null,
    shape: null,
    title_in_image: null,
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: null,
    ...overrides,
  }
}

describe('fallbackEmptyTileShape — 타일이 0개인 타일형 list는 brief (계측과 화면이 함께 쓰는 규칙)', () => {
  it('타일형 list는 타일이 0개일 때만 brief로 바꾼다', () => {
    expect(fallbackEmptyTileShape('list', 'badge', 0)).toBe('brief')
    expect(fallbackEmptyTileShape('list', 'badge', 1)).toBe('list')
  })

  it('랭킹 행형 list는 타일이 0개여도 그대로 둔다', () => {
    expect(fallbackEmptyTileShape('list', 'ranking', 0)).toBe('list')
  })

  it('list가 아닌 모양은 타일 수와 상관없이 그대로 둔다', () => {
    for (const shape of ['hero', 'poster', 'square', 'brief'] as const) {
      expect(fallbackEmptyTileShape(shape, 'badge', 0)).toBe(shape)
    }
  })
})

describe('toCardView — 표시 데이터', () => {
  it('손으로 만든 최소 표시 데이터가 타입에 맞는다(카드 ID·활성 여부·노출 기간·정렬 순서 없이)', () => {
    // 운영툴 미리보기가 승인 전 초안으로 만드는 값 — 컴파일되는 것이 확인이다
    const hero: CardView = { shape: 'hero', resource: 'mission', title: '초안', imageUrl: null }
    const brief: CardView = { shape: 'brief', resource: 'drop', title: '초안' }
    const tiles: CardView = { shape: 'list', resource: 'badge', title: '초안', tiles: [{ name: '배지', imageUrl: null }] }
    expect([hero.shape, brief.shape, tiles.shape]).toEqual(['hero', 'brief', 'list'])
    expect(hero.tracking).toBeUndefined()
  })

  it('카드 ID·활성 여부·노출 기간·정렬 순서·노출 태그를 표시 데이터에 싣지 않는다', () => {
    const view = toCardView(makeCard({ template_type: 'editorial_article', layout_type: 'large_thumbnail' }), { tracking: true })
    const keys = Object.keys(view)
    for (const forbidden of ['id', 'cardId', 'is_active', 'isActive', 'starts_at', 'ends_at', 'sort_order', 'sortOrder', 'exposure_tags']) {
      expect(keys).not.toContain(forbidden)
    }
    // 카드 ID는 계측 정보 안에만 있다
    expect(view.tracking?.cardId).toBe('card-1')
  })

  it('계측 정보는 요청할 때만 싣는다(기본은 없다 — 미리보기가 계측을 남기지 않는다)', () => {
    expect(toCardView(makeCard()).tracking).toBeUndefined()
    expect(toCardView(makeCard(), {}).tracking).toBeUndefined()
    expect(toCardView(makeCard(), { tracking: false }).tracking).toBeUndefined()
  })

  it('계측 정보는 카드 ID·유형 ID·템플릿·그려진 모양을 하나로 묶는다', () => {
    const view = toCardView(makeCard({ shape: 'poster' }), { tracking: true })
    expect(view.tracking).toEqual({ cardId: 'card-1', contentTypeId: 'T05', templateType: 'badge_spotlight', shape: 'poster' })
    expect(toCardView(makeCard({ template_type: 'drop_alert', shape: 'brief' }), { tracking: true }).tracking?.templateType).toBe('drop_alert')
    expect(toCardView(makeCard({ content_type_id: null }), { tracking: true }).tracking?.contentTypeId).toBeNull()
  })

  it('기본 필드: 제목·부제·설명문·링크·라벨. 비었거나 공백뿐인 값은 싣지 않는다', () => {
    const view = toCardView(makeCard({ subtitle: ' 부제 ', description: '설명문', resolved_href: '/badges/b1' }))
    expect(view).toMatchObject({ title: '제목', subtitle: '부제', description: '설명문', href: '/badges/b1', label: '배지 소개' })
    const bare = toCardView(makeCard({ subtitle: '  ', description: '', resolved_href: '' }))
    expect(bare.subtitle).toBeUndefined()
    expect(bare.description).toBeUndefined()
    expect(bare.href).toBeUndefined()
  })

  it('기준 시각을 넘기면 표시 데이터에 남기고, 안 넘기면 없다', () => {
    expect(toCardView(makeCard(), { now: NOW }).now).toBe(NOW.toISOString())
    expect(toCardView(makeCard()).now).toBeUndefined()
  })

  describe('모양', () => {
    it('저장된 shape가 있으면 그 모양이다(옛 layout과 상관없이)', () => {
      expect(toCardView(makeCard({ shape: 'poster', layout_type: 'shortcut' })).shape).toBe('poster')
    })

    it('shape가 없으면 전환 상수와 상관없이 옛 값을 새 모양으로 바꾼다(미리보기는 늘 새 모양)', () => {
      expect(toCardView(makeCard({ layout_type: 'shortcut' })).shape).toBe('brief')
      expect(toCardView(makeCard({ layout_type: 'banner' })).shape).toBe('poster')
      expect(toCardView(makeCard({ layout_type: 'large_thumbnail' })).shape).toBe('hero')
    })

    it('타일이 0개인 타일형 list는 brief다(저장된 list도, 옛 badge_gallery도)', () => {
      const fromLegacy = toCardView(makeCard({ layout_type: 'badge_gallery', resolved_badges: [] }), { tracking: true })
      expect(fromLegacy.shape).toBe('brief')
      expect(toCardView(makeCard({ shape: 'list', resolved_badges: [] })).shape).toBe('brief')
      // 그려진 모양을 기록하므로 계측 정보도 brief다
      expect(fromLegacy.tracking?.shape).toBe('brief')
    })

    it('타일이 있는 타일형 list는 타일을 싣는다(희귀도·보유 여부 포함)', () => {
      const view = toCardView(
        makeCard({
          layout_type: 'badge_gallery',
          resolved_badges: [badge('a'), badge('b', { earned: false, rarity: null, image_url: null })],
        }),
      )
      expect(view.shape).toBe('list')
      if (view.shape !== 'list') throw new Error('list여야 한다')
      expect(view.tiles).toEqual([
        { name: '배지 a', imageUrl: 'https://cdn.example/a.png', rarity: 'rare', earned: true },
        { name: '배지 b', imageUrl: null, rarity: null, earned: false },
      ])
      expect(view.ranking).toBeUndefined()
    })

    it('랭킹 행형 list는 타일이 없어도 brief가 되지 않고 순위를 싣는다', () => {
      const ranking = { entries: [], totalParticipants: 0, metricType: 'mission_progress', missionType: null, conditionFieldKey: null } as never
      const view = toCardView(
        makeCard({ template_type: 'ranking_board', layout_type: 'ranking_list', resolved_ranking: ranking, resolved_badges: [] }),
      )
      expect(view.shape).toBe('list')
      if (view.shape !== 'list') throw new Error('list여야 한다')
      expect(view.resource).toBe('ranking')
      expect(view.tiles).toEqual([])
      expect(view.ranking).toBe(ranking)
    })

    it('순위를 읽지 못한 랭킹 카드도 행형 list이고 ranking은 null이다', () => {
      const view = toCardView(makeCard({ template_type: 'ranking_board', layout_type: 'ranking_list', resolved_ranking: null }))
      expect(view.shape).toBe('list')
      if (view.shape !== 'list') throw new Error('list여야 한다')
      expect(view.ranking).toBeNull()
    })
  })

  describe('이미지', () => {
    it('이미지 모양은 커버 주소를 imageUrl로 싣는다', () => {
      const view = toCardView(makeCard())
      expect(view).toMatchObject({ shape: 'hero', imageUrl: 'https://cdn.example/cover.png' })
    })

    it('커버가 없으면 첫 배지 그림을 쓰고, 유저가 그 배지를 갖지 않았으면 흑백(imageDimmed)이다', () => {
      const unowned = toCardView(makeCard({ cover_image_url: null, badge_ids: ['a'], resolved_badges: [badge('a', { earned: false })] }))
      expect(unowned).toMatchObject({ shape: 'square', imageUrl: 'https://cdn.example/a.png', imageDimmed: true })
      const owned = toCardView(makeCard({ cover_image_url: null, badge_ids: ['a'], resolved_badges: [badge('a', { earned: true })] }))
      expect(owned).toMatchObject({ shape: 'square', imageUrl: 'https://cdn.example/a.png' })
      expect(owned).not.toHaveProperty('imageDimmed')
    })

    it('보유 여부를 모르면(earned 없음, 유저 정보가 없는 미리보기) 승격한 배지 그림은 컬러다 (티켓 20261001_2208)', () => {
      const view = toCardView(makeCard({ cover_image_url: null, badge_ids: ['a'], resolved_badges: [badge('a', { earned: undefined })] }))
      expect(view).toMatchObject({ shape: 'square', imageUrl: 'https://cdn.example/a.png' })
      expect(view).not.toHaveProperty('imageDimmed')
    })

    it('커버가 없고 그림 없는 배지가 걸려 있으면 square이고 imageUrl은 null이다(이미지 칸에 자리 표시, 티켓 20261001_2244)', () => {
      // 기록 모양(`events.ts`)이 badge_ids 유무로 정하는 것과 같다 — 배지 그림이 없다는 이유로 화면만 hero가 되지 않는다.
      const view = toCardView(
        makeCard({ cover_image_url: null, badge_ids: ['a'], resolved_badges: [badge('a', { image_url: null })] }),
      )
      expect(view).toMatchObject({ shape: 'square', imageUrl: null })
      expect(view).not.toHaveProperty('imageDimmed')
    })

    it('배지가 전부 삭제돼도 badge_ids가 남아 있으면 square이고 imageUrl은 null이다', () => {
      const view = toCardView(makeCard({ cover_image_url: null, badge_ids: ['gone'], resolved_badges: [] }))
      expect(view).toMatchObject({ shape: 'square', imageUrl: null })
    })

    it('커버도 배지 그림도 없으면 imageUrl은 null이다(이미지 칸은 그리는 쪽이 유지한다)', () => {
      const view = toCardView(makeCard({ cover_image_url: null, resolved_badges: [] }))
      expect(view).toMatchObject({ shape: 'hero', imageUrl: null })
    })

    it('어드민이 올린 커버는 배지 그림으로 바뀌지 않고 흑백도 아니다', () => {
      const view = toCardView(makeCard({ resolved_badges: [badge('a', { earned: false })] }))
      expect(view).toMatchObject({ imageUrl: 'https://cdn.example/cover.png' })
      expect(view).not.toHaveProperty('imageDimmed')
    })
  })

  describe('이미지에 제목 있음', () => {
    const missionCard = (overrides: Partial<TodayCardWithHref> = {}) =>
      makeCard({
        template_type: 'mission_spotlight',
        cover_image_url: 'https://cdn.example/mission.png',
        mission_id: 'm1',
        resolved_mission: {
          starts_at: '2026-10-12T00:00:00+09:00',
          ends_at: '2026-11-08T23:59:59+09:00',
          reward_points: 300,
          reward_badge_count: 1,
          image_url: 'https://cdn.example/mission.png',
        },
        ...overrides,
      })

    it('옛 미션 소개 카드는 커버가 미션 이미지와 같으면 제목 있음이다', () => {
      expect(toCardView(missionCard()).titleInImage).toBe(true)
    })

    it('저장된 값이 우선이다', () => {
      expect(toCardView(missionCard({ title_in_image: false })).titleInImage).toBe(false)
      expect(toCardView(makeCard({ title_in_image: true })).titleInImage).toBe(true)
    })

    it('커버가 미션 이미지와 다르거나 미션 소개가 아니면 false다', () => {
      expect(toCardView(missionCard({ cover_image_url: 'https://cdn.example/other.png' })).titleInImage).toBe(false)
      expect(toCardView(makeCard()).titleInImage).toBe(false)
    })
  })

  describe('자원별 필수 정보와 부가 값', () => {
    it('옛 미션 소개 카드: square, 기간·보상 줄', () => {
      const view = toCardView(
        makeCard({
          template_type: 'mission_spotlight',
          mission_id: 'm1',
          resolved_mission: {
            starts_at: '2026-10-12T00:00:00+09:00',
            ends_at: '2026-11-08T23:59:59+09:00',
            reward_points: 300,
            reward_badge_count: 1,
            image_url: null,
          },
        }),
        { now: NOW },
      )
      expect(view).toMatchObject({
        shape: 'square',
        resource: 'mission',
        facts: ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'],
      })
    })

    it('미션을 찾지 못한 미션 카드는 필수 정보 줄이 없다', () => {
      const view = toCardView(makeCard({ template_type: 'mission_spotlight', mission_id: 'm1', resolved_mission: null }))
      expect(view.facts).toBeUndefined()
    })

    it('조회 값이 아예 없는 카드(미리보기용으로 손으로 만든 값)도 변환된다', () => {
      const card = makeCard({ template_type: 'mission_spotlight' })
      delete card.resolved_mission
      delete card.resolved_collection
      expect(() => toCardView(card)).not.toThrow()
    })

    it('진행 알림 카드가 미션을 가리키면 그 미션의 기간만 싣는다', () => {
      const view = toCardView(
        makeCard({
          template_type: 'progress_nudge',
          layout_type: 'shortcut',
          mission_id: 'm1',
          resolved_mission: { starts_at: '2026-10-01T00:00:00+09:00', ends_at: null, reward_points: 500, reward_badge_count: 2, image_url: null },
        }),
        { now: NOW },
      )
      expect(view).toMatchObject({ shape: 'brief', resource: 'auto', facts: ['기간 상시'] })
    })

    it('드랍 카드: 필수 정보 지역 줄과 칩 줄 지역 핀', () => {
      const view = toCardView(makeCard({ template_type: 'drop_alert', layout_type: 'shortcut', region_label: '한강공원' }))
      expect(view).toMatchObject({ shape: 'brief', resource: 'drop', facts: ['지역 한강공원'], regionLabel: '한강공원' })
    })

    it('컬렉션 카드: 이름과 아이템 수', () => {
      const view = toCardView(
        makeCard({
          template_type: 'itembook_milestone',
          item_book_id: 'book-1',
          resolved_collection: { name: '한강 컬렉션', item_count: 12 },
        }),
      )
      expect(view).toMatchObject({ resource: 'collection', facts: ['한강 컬렉션', '아이템 12개'] })
    })

    it('기사 카드: hero, 게재일은 publishedAt으로 따로 두고 필수 정보 줄은 없다', () => {
      const view = toCardView(makeCard({ template_type: 'editorial_article', layout_type: 'other', starts_at: '2026-10-03T09:00:00+09:00' }))
      expect(view).toMatchObject({ shape: 'hero', resource: 'article', publishedAt: '2026-10-03T09:00:00+09:00' })
      expect(view.facts).toBeUndefined()
    })

    it('기사가 아닌 카드에는 publishedAt이 없다', () => {
      expect(toCardView(makeCard()).publishedAt).toBeUndefined()
    })

    it('배지 하나: 이름 줄과 희귀도, 배지가 여럿이면 이름 줄과 희귀도가 없다', () => {
      const one = toCardView(makeCard({ layout_type: 'shortcut', resolved_badges: [badge('a', { name: '한강 러너', rarity: 'epic' })] }))
      expect(one).toMatchObject({ resource: 'badge', facts: ['한강 러너'], rarity: 'epic' })
      const many = toCardView(makeCard({ layout_type: 'badge_gallery', resolved_badges: [badge('a'), badge('b')] }))
      expect(many.facts).toBeUndefined()
      expect(many.rarity).toBeUndefined()
    })

    it('등급이 없는 무한레벨형 배지 하나는 희귀도가 null이다', () => {
      const view = toCardView(makeCard({ layout_type: 'shortcut', resolved_badges: [badge('a', { rarity: null })] }))
      expect(view.rarity).toBeNull()
    })
  })

  describe('brief 썸네일 (64px 칸, 티켓 20261001_1458)', () => {
    const briefBadgeCard = (badges: ResolvedBadge[], overrides: Partial<TodayCardWithHref> = {}) =>
      makeCard({ layout_type: 'shortcut', cover_image_url: null, resolved_badges: badges, ...overrides })

    it('JAM! 배지가 하나이고 그림이 있으면 그 그림이 썸네일이다(보유한 배지는 컬러)', () => {
      const view = toCardView(briefBadgeCard([badge('a', { earned: true })]))
      expect(view).toMatchObject({ shape: 'brief', thumbnailUrl: 'https://cdn.example/a.png' })
      expect(view).not.toHaveProperty('thumbnailDimmed')
    })

    it('유저가 갖지 않은 배지는 흑백(thumbnailDimmed)이다', () => {
      const view = toCardView(briefBadgeCard([badge('a', { earned: false })]))
      expect(view).toMatchObject({ thumbnailUrl: 'https://cdn.example/a.png', thumbnailDimmed: true })
    })

    it('보유 여부를 모르면(earned 없음, 유저 정보가 없는 미리보기) 썸네일은 컬러다 (티켓 20261001_2208)', () => {
      const view = toCardView(briefBadgeCard([badge('a', { earned: undefined })]))
      expect(view).toMatchObject({ shape: 'brief', thumbnailUrl: 'https://cdn.example/a.png' })
      expect(view).not.toHaveProperty('thumbnailDimmed')
    })

    it('배지 그림이 없으면(null·빈 값) 썸네일 키가 없다 — 그리는 쪽이 자원 아이콘을 그린다', () => {
      expect(toCardView(briefBadgeCard([badge('a', { image_url: null })]))).not.toHaveProperty('thumbnailUrl')
      expect(toCardView(briefBadgeCard([badge('a', { image_url: '' })]))).not.toHaveProperty('thumbnailUrl')
    })

    it('배지가 여러 개이면 썸네일이 없다(여러 개는 list가 맞다)', () => {
      const view = toCardView(briefBadgeCard([badge('a'), badge('b')], { shape: 'brief' }))
      expect(view.shape).toBe('brief')
      expect(view).not.toHaveProperty('thumbnailUrl')
    })

    it('커버와 미션 이미지는 썸네일로 쓰지 않는다', () => {
      const cover = toCardView(makeCard({ layout_type: 'shortcut', cover_image_url: 'https://cdn.example/cover.png' }))
      expect(cover.shape).toBe('brief')
      expect(cover).not.toHaveProperty('thumbnailUrl')
      const mission = toCardView(
        makeCard({
          template_type: 'mission_spotlight',
          layout_type: 'shortcut',
          mission_id: 'm1',
          cover_image_url: null,
          resolved_mission: {
            starts_at: '2026-10-01T00:00:00+09:00',
            ends_at: null,
            reward_points: null,
            reward_badge_count: 0,
            image_url: 'https://cdn.example/mission.png',
          },
        }),
      )
      expect(mission.shape).toBe('brief')
      expect(mission).not.toHaveProperty('thumbnailUrl')
    })

    it('JAM! 배지 자원이 아니면 배지가 하나 걸려 있어도 썸네일이 없다', () => {
      const view = toCardView(briefBadgeCard([badge('a')], { template_type: 'drop_alert' }))
      expect(view).toMatchObject({ shape: 'brief', resource: 'drop' })
      expect(view).not.toHaveProperty('thumbnailUrl')
    })

    it('이미지 모양에는 thumbnailUrl이 없다(imageUrl과 섞이지 않는다)', () => {
      const view = toCardView(makeCard({ cover_image_url: null, badge_ids: ['a'], resolved_badges: [badge('a')] }))
      expect(view.shape).toBe('square')
      expect(view).not.toHaveProperty('thumbnailUrl')
    })
  })
})
