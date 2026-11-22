/**
 * 홈피드 카드 표시 데이터 변환 (티켓 20261001_1357)
 *
 * 확인하는 것:
 * 1. `buildFacts` — 자원별 필수 정보를 최대 2줄로 만들고, 값이 없는 줄은 생략한다.
 *    남은 시간 경계(7일·24시간)와 KST 날짜 경계를 시각 값으로 고정한다.
 * 2. `toCardView` — 카드 ID·활성 여부·노출 기간·정렬 순서 없이 표시 데이터를 만들고,
 *    계측 정보(`tracking`)는 요청했을 때만 싣는다. 옛 7모양 갈래는 지웠다(티켓 20261122_1101) — 유형별 갈래는 `cardView.feed*.test.ts`가 맡는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { TodayCardWithHref, ResolvedBadge } from '../cards'
import {
  CARD_RESOURCES,
  buildFacts,
  formatKstMonthDay,
  resourceOfTemplate,
  toCardView,
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
    ['recipe_reveal', 'recipe'],
    ['content_intro', 'auto'],
  ] as const)('%s → %s', (template, resource) => {
    expect(resourceOfTemplate(template)).toBe(resource)
  })

  it('자원 8개 모두 대응하는 템플릿이 있다(recipe는 recipe_reveal이 맡는다, 티켓 20261006_1217)', () => {
    const mapped = (
      ['mission_spotlight', 'drop_alert', 'badge_spotlight', 'editorial_article', 'ranking_board', 'itembook_milestone', 'progress_nudge', 'location_trend', 'recipe_reveal', 'content_intro'] as const
    ).map(resourceOfTemplate)
    expect([...new Set(mapped)].sort()).toEqual([...CARD_RESOURCES].sort())
  })

  it('처음 보는 템플릿 값은 undefined를 돌려준다(그리는 쪽이 견디는 안전망)', () => {
    expect(resourceOfTemplate('future_template' as never)).toBeUndefined()
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
  it('정보 줄에 「기간」·「보상」 접두어가 없고 기간의 «~» 앞뒤에 공백이 있다(티켓 20261109_1458)', () => {
    const lines = buildFacts('mission', { period, rewardPoints: 300, rewardBadgeCount: 1 }, NOW)
    expect(lines).toEqual(['10월 12일 ~ 11월 8일', '300 포인트 · 배지 1개'])
    for (const line of lines) expect(line).not.toMatch(/^(기간|보상|지역) /)
  })

  const period = { startsAt: '2026-10-12T00:00:00+09:00', endsAt: '2026-11-08T23:59:59+09:00' }

  it('기간과 보상을 두 줄로 만든다(예: 10월 12일 ~ 11월 8일, 300 포인트 · 배지 1개)', () => {
    expect(buildFacts('mission', { period, rewardPoints: 300, rewardBadgeCount: 1 }, NOW)).toEqual([
      '10월 12일 ~ 11월 8일',
      '300 포인트 · 배지 1개',
    ])
  })

  it('종료가 없으면 「상시」다', () => {
    expect(buildFacts('mission', { period: { startsAt: period.startsAt, endsAt: null }, rewardPoints: 300 }, NOW)).toEqual([
      '상시',
      '300 포인트',
    ])
  })

  it('보상은 있는 것만 쓴다(포인트만, 배지만)', () => {
    expect(buildFacts('mission', { period, rewardPoints: 300, rewardBadgeCount: 0 }, NOW)[1]).toBe('300 포인트')
    expect(buildFacts('mission', { period, rewardPoints: 0, rewardBadgeCount: 2 }, NOW)[1]).toBe('배지 2개')
    expect(buildFacts('mission', { period, rewardPoints: null, rewardBadgeCount: 1 }, NOW)[1]).toBe('배지 1개')
  })

  it('포인트는 천 단위로 쉼표를 찍는다', () => {
    expect(buildFacts('mission', { period, rewardPoints: 1500 }, NOW)[1]).toBe('1,500 포인트')
  })

  it('보상이 없으면 그 줄만 생략한다', () => {
    expect(buildFacts('mission', { period, rewardPoints: 0, rewardBadgeCount: 0 }, NOW)).toEqual(['10월 12일 ~ 11월 8일'])
    expect(buildFacts('mission', { period }, NOW)).toEqual(['10월 12일 ~ 11월 8일'])
  })

  it('기간 값이 없으면 기간 줄만 생략한다', () => {
    expect(buildFacts('mission', { period: null, rewardPoints: 300 }, NOW)).toEqual(['300 포인트'])
  })

  it('시작·종료 날짜는 KST 기준이다(종료 23:59:59 KST는 그날, 00:00 KST는 다음 날)', () => {
    const kstEndOfDay = buildFacts('mission', { period: { startsAt: '2026-10-11T15:00:00Z', endsAt: '2026-11-08T14:59:59Z' } }, NOW)
    expect(kstEndOfDay).toEqual(['10월 12일 ~ 11월 8일'])
    const kstNextDay = buildFacts('mission', { period: { startsAt: '2026-10-11T14:59:59Z', endsAt: '2026-11-08T15:00:00Z' } }, NOW)
    expect(kstNextDay).toEqual(['10월 11일 ~ 11월 9일'])
  })

  it('읽을 수 없는 날짜면 기간 줄을 만들지 않는다', () => {
    expect(buildFacts('mission', { period: { startsAt: 'x', endsAt: '2026-11-08T00:00:00+09:00' }, rewardPoints: 300 }, NOW)).toEqual([
      '300 포인트',
    ])
  })
})

describe('buildFacts — 남은 시간 (종료 7일 이내, 기간 줄 대신)', () => {
  const faces = (ms: number) => buildFacts('mission', { period: endsIn(ms), rewardPoints: 300 }, NOW)

  it('7일 경계: 정확히 7일 남으면 「7일 남음」, 1밀리초라도 더 길면 기간을 쓴다', () => {
    expect(faces(7 * DAY)[0]).toBe('7일 남음')
    expect(faces(7 * DAY + 1)[0]).toMatch(/^\d+월 \d+일 ~ /)
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
    expect(faces(0)[0]).toMatch(/^\d+월 \d+일 ~ /)
    expect(faces(-HOUR)[0]).toMatch(/^\d+월 \d+일 ~ /)
  })

  it('남은 시간은 기간 줄을 대신할 뿐이고 보상 줄은 그대로다(최대 2줄)', () => {
    expect(faces(3 * DAY)).toEqual(['3일 남음', '300 포인트'])
  })

  it('KST 자정 직전 종료: 기준 시각이 KST 2026-10-05 23:59:59이고 종료가 10-12 23:59:59면 정확히 7일이다', () => {
    const now = new Date('2026-10-05T23:59:59+09:00')
    const period = { startsAt: '2026-10-01T00:00:00+09:00', endsAt: '2026-10-12T23:59:59+09:00' }
    expect(buildFacts('mission', { period }, now)).toEqual(['7일 남음'])
    expect(buildFacts('mission', { period }, new Date(now.getTime() - 1))[0]).toMatch(/^\d+월 \d+일 ~ /)
  })

  it('종료가 없는 상시 미션에는 남은 시간이 없다', () => {
    expect(buildFacts('mission', { period: { startsAt: '2026-10-01T00:00:00+09:00', endsAt: null } }, NOW)).toEqual(['상시'])
  })

  it('자동 카드가 가리키는 미션에도 같은 규칙이 적용된다', () => {
    expect(buildFacts('auto', { period: endsIn(2 * DAY + HOUR) }, NOW)).toEqual(['2일 남음'])
  })
})

describe('buildFacts — 레시피 (티켓 20261006_1217)', () => {
  it('공개 전: 「재료 N개」와 「공개 M월 D일」(KST)', () => {
    expect(buildFacts('recipe', { ingredientCount: 4, revealAt: '2026-10-12T18:00:00+09:00' }, NOW)).toEqual(['재료 4개', '공개 10월 12일'])
  })

  it('공개일은 UTC가 아니라 KST 날짜다(경계 1초 전후)', () => {
    expect(buildFacts('recipe', { ingredientCount: 2, revealAt: '2026-10-11T14:59:59Z' }, NOW)[1]).toBe('공개 10월 11일')
    expect(buildFacts('recipe', { ingredientCount: 2, revealAt: '2026-10-11T15:00:00Z' }, NOW)[1]).toBe('공개 10월 12일')
  })

  it('공개 뒤: 「재료 N개」와 보상(공개일은 이미 지나 줄에서 빠진다)', () => {
    expect(buildFacts('recipe', { ingredientCount: 4, rewardPoints: 300, rewardBadgeCount: 1 }, NOW)).toEqual([
      '재료 4개',
      '300 포인트 · 배지 1개',
    ])
    expect(buildFacts('recipe', { ingredientCount: 3, rewardPoints: 0, rewardBadgeCount: 2 }, NOW)).toEqual(['재료 3개', '배지 2개'])
  })

  it('보상이 0이면 그 줄만 생략한다', () => {
    expect(buildFacts('recipe', { ingredientCount: 4, rewardPoints: 0, rewardBadgeCount: 0 }, NOW)).toEqual(['재료 4개'])
    expect(buildFacts('recipe', { ingredientCount: 4 }, NOW)).toEqual(['재료 4개'])
  })

  it('공개일을 읽을 수 없으면 공개일 줄만 생략하고, 공개일이 있으면 보상은 쓰지 않는다', () => {
    expect(buildFacts('recipe', { ingredientCount: 4, revealAt: 'not-a-date' }, NOW)).toEqual(['재료 4개'])
    expect(buildFacts('recipe', { ingredientCount: 4, revealAt: '2026-10-12T00:00:00+09:00', rewardPoints: 300 }, NOW)).toEqual([
      '재료 4개',
      '공개 10월 12일',
    ])
  })

  it('재료 수가 없거나 0이면 그 줄이 없다', () => {
    expect(buildFacts('recipe', { revealAt: '2026-10-12T00:00:00+09:00' }, NOW)).toEqual(['공개 10월 12일'])
    expect(buildFacts('recipe', { ingredientCount: 0, revealAt: '2026-10-12T00:00:00+09:00' }, NOW)).toEqual(['공개 10월 12일'])
    expect(buildFacts('recipe', {}, NOW)).toEqual([])
  })

  it('다른 자원의 값(기간·지역 등)은 쓰지 않는다', () => {
    expect(buildFacts('recipe', { period: endsIn(DAY), place: '한강', collectionName: '컬렉션', badgeName: '배지' }, NOW)).toEqual([])
  })
})

describe('buildFacts — 그 밖의 자원', () => {
  it('드랍: 지역 한 줄(시각은 값이 없어 생략)', () => {
    expect(buildFacts('drop', { place: '한강공원' }, NOW)).toEqual(['한강공원'])
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

  it.each(['article', 'ranking'] as CardResource[])('%s: 필수 정보 줄이 없다(다른 자원의 값이 들어와도 쓰지 않는다)', (resource) => {
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
      ingredientCount: 4,
      revealAt: '2026-10-12T00:00:00+09:00',
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

describe('toCardView — 표시 데이터', () => {
  it('카드 ID·활성 여부·노출 기간·정렬 순서·노출 태그를 표시 데이터에 싣지 않는다', () => {
    const view = toCardView(makeCard({ template_type: 'editorial_article', layout_type: 'large_thumbnail' }), { tracking: true })
    const keys = Object.keys(view)
    for (const forbidden of ['id', 'cardId', 'is_active', 'isActive', 'starts_at', 'ends_at', 'sort_order', 'sortOrder', 'exposure_tags']) {
      expect(keys).not.toContain(forbidden)
    }
    // 카드 ID는 계측 정보 안에만 있다
    expect(view.tracking?.cardId).toBe('card-1')
  })

  it('옛 7모양 갈래가 없다: 모양별 필드(shape·tiles·ranking·thumbnailUrl)가 표시 데이터에 없고 유형(feedType)이 늘 있다', () => {
    for (const feedType of [null, 'hero_box', 'badge_intro', 'bogus'] as const) {
      const view = toCardView(makeCard({ feed_type: feedType as never, shape: 'list', layout_type: 'ranking_list', template_type: 'ranking_board' }))
      expect(view.feedType).toBeDefined()
      for (const key of ['shape', 'tiles', 'ranking', 'thumbnailUrl', 'layoutType']) expect(Object.keys(view)).not.toContain(key)
    }
  })

  it('계측 정보는 요청할 때만 싣는다(기본은 없다 — 미리보기가 계측을 남기지 않는다)', () => {
    expect(toCardView(makeCard()).tracking).toBeUndefined()
    expect(toCardView(makeCard(), {}).tracking).toBeUndefined()
    expect(toCardView(makeCard(), { tracking: false }).tracking).toBeUndefined()
  })

  it('계측 정보는 카드 ID·유형 ID·템플릿·그려진 유형을 하나로 묶는다', () => {
    const view = toCardView(makeCard({ feed_type: 'badge_intro' }), { tracking: true })
    expect(view.tracking).toEqual({ cardId: 'card-1', contentTypeId: 'T05', templateType: 'badge_spotlight', feedType: 'badge_intro' })
    expect(toCardView(makeCard({ template_type: 'drop_alert' }), { tracking: true }).tracking?.templateType).toBe('drop_alert')
    expect(toCardView(makeCard({ content_type_id: null }), { tracking: true }).tracking?.contentTypeId).toBeNull()
    // feed_type이 비었으면 그려진 유형은 텍스트 박스다
    expect(toCardView(makeCard(), { tracking: true }).tracking?.feedType).toBe('text_box')
  })

  it('기본 필드: 제목·부제·링크·라벨. 비었거나 공백뿐인 값은 싣지 않는다', () => {
    const view = toCardView(makeCard({ subtitle: ' 부제 ', resolved_href: '/badges/b1' }))
    expect(view).toMatchObject({ title: '제목', subtitle: '부제', href: '/badges/b1', label: '배지' })
    const bare = toCardView(makeCard({ subtitle: '  ', resolved_href: '' }))
    expect(bare.subtitle).toBeUndefined()
    expect(bare.href).toBeUndefined()
  })

  describe('설명 문단은 유형이 정한다(옛 «배지 소개·컨텐츠 소개만» 규칙은 지웠다)', () => {
    it('히어로는 설명을 싣고, 설명이 없거나 공백뿐이면 싣지 않는다', () => {
      expect(toCardView(makeCard({ feed_type: 'hero_box', description: '설명문' })).description).toBe('설명문')
      expect(toCardView(makeCard({ feed_type: 'hero_box', description: '  ' })).description).toBeUndefined()
    })

    it('feed_type이 비어 텍스트 박스가 되면 설명 값이 있어도 싣지 않는다', () => {
      for (const template of ['badge_spotlight', 'content_intro', 'drop_alert'] as const) {
        const view = toCardView(makeCard({ template_type: template, description: '설명문' }))
        expect(view.description).toBeUndefined()
        expect(Object.keys(view)).not.toContain('description')
      }
    })
  })

  it('기준 시각을 넘기면 표시 데이터에 남기고, 안 넘기면 없다', () => {
    expect(toCardView(makeCard(), { now: NOW }).now).toBe(NOW.toISOString())
    expect(toCardView(makeCard()).now).toBeUndefined()
  })

  describe('이미지', () => {
    it('커버 주소를 imageUrl로 싣는다', () => {
      expect(toCardView(makeCard({ cover_image_url: 'https://cdn.example/c.png' })).imageUrl).toBe('https://cdn.example/c.png')
    })

    it('커버가 없으면 첫 배지 그림을 쓴다(보유 여부와 무관하게 컬러다, 티켓 20261118_1523)', () => {
      const view = toCardView(makeCard({ cover_image_url: null, resolved_badges: [badge('a', { earned: false })] }))
      expect(view.imageUrl).toBe('https://cdn.example/a.png')
      expect(Object.keys(view)).not.toContain('imageDimmed')
    })

    it('커버도 배지 그림도 없으면 imageUrl은 null이다', () => {
      expect(toCardView(makeCard({ cover_image_url: null })).imageUrl).toBeNull()
    })

    it('미션 소개 카드는 커버가 없으면 미션 대표 이미지를 쓰고, 카드 커버가 있으면 커버가 우선이다(티켓 20261120_1825)', () => {
      const mission = { starts_at: '2026-10-01T00:00:00+09:00', ends_at: null, reward_points: 0, reward_badge_count: 0, image_url: 'https://cdn.example/m.png' }
      const base = { template_type: 'mission_spotlight' as const, mission_id: 'm1', resolved_mission: mission }
      expect(toCardView(makeCard({ ...base, cover_image_url: null })).imageUrl).toBe('https://cdn.example/m.png')
      expect(toCardView(makeCard({ ...base, cover_image_url: 'https://cdn.example/c.png' })).imageUrl).toBe('https://cdn.example/c.png')
      expect(toCardView(makeCard({ template_type: 'badge_spotlight', resolved_mission: mission, cover_image_url: null })).imageUrl).toBeNull()
    })
  })

  describe('이미지에 제목 있음', () => {
    it('저장된 값이 우선이고, NULL이면 글자로 그린다(false)', () => {
      expect(toCardView(makeCard({ title_in_image: true })).titleInImage).toBe(true)
      expect(toCardView(makeCard({ title_in_image: false })).titleInImage).toBe(false)
      expect(toCardView(makeCard({ title_in_image: null })).titleInImage).toBe(false)
    })
  })

  describe('자원별 필수 정보와 부가 값', () => {
    it('미션 소개 카드: 기간·보상 줄', () => {
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
      expect(view).toMatchObject({ resource: 'mission', facts: ['10월 12일 ~ 11월 8일', '300 포인트 · 배지 1개'] })
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
      expect(view).toMatchObject({ resource: 'auto', facts: ['상시'] })
    })

    it('드랍 카드: 필수 정보 지역 줄과 칩 줄 지역 핀', () => {
      const view = toCardView(makeCard({ template_type: 'drop_alert', layout_type: 'shortcut', region_label: '한강공원' }))
      expect(view).toMatchObject({ resource: 'drop', facts: ['한강공원'], regionLabel: '한강공원' })
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

    it('기사 카드: 게재일은 publishedAt으로 따로 두고 필수 정보 줄은 없다', () => {
      const view = toCardView(makeCard({ template_type: 'editorial_article', layout_type: 'other', starts_at: '2026-10-03T09:00:00+09:00' }))
      expect(view).toMatchObject({ resource: 'article', publishedAt: '2026-10-03T09:00:00+09:00' })
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
})

describe('toCardView — 템플릿 구분 값(template, 티켓 20261001_2244)', () => {
  const TEMPLATES = [
    'badge_spotlight',
    'progress_nudge',
    'mission_spotlight',
    'itembook_milestone',
    'location_trend',
    'drop_alert',
    'editorial_article',
    'ranking_board',
    'recipe_reveal',
    'content_intro',
  ] as const

  it.each(TEMPLATES)('%s: 계측 정보(tracking)가 없어도 카드의 템플릿을 늘 싣는다', (templateType) => {
    const view = toCardView(makeCard({ template_type: templateType }))
    expect(view.tracking).toBeUndefined()
    expect(view.template).toBe(templateType)
  })

  it('진행 알림과 지역 트렌드는 같은 자원(auto)이지만 템플릿으로 구분된다', () => {
    const nudge = toCardView(makeCard({ template_type: 'progress_nudge' }))
    const trend = toCardView(makeCard({ template_type: 'location_trend' }))
    expect([nudge.resource, trend.resource]).toEqual(['auto', 'auto'])
    expect([nudge.template, trend.template]).toEqual(['progress_nudge', 'location_trend'])
  })
})

describe('toCardView — 홈이 더 내지 않는 자원(랭킹 보드·레시피 공개)도 던지지 않고 텍스트 박스로 그린다 (티켓 20261122_1101)', () => {
  it('랭킹 보드 카드: 순위 값이 있어도 싣지 않고 제목만 그린다', () => {
    const view = toCardView(
      makeCard({
        template_type: 'ranking_board',
        layout_type: 'ranking_list',
        resolved_ranking: { metricType: 'mission_progress', missionType: null, conditionFieldKey: null, totalParticipants: 0, entries: [] },
      }),
    )
    expect(view).toMatchObject({ feedType: 'text_box', resource: 'ranking', title: '제목' })
    expect(Object.keys(view)).not.toContain('ranking')
  })

  it('레시피 공개 카드: 공개 전이면 「재료 N개」·「공개 M월 D일」 정보 줄을 만들고, 레시피 값이 없으면 줄 없이 그린다', () => {
    const scheduled = { state: 'scheduled', ingredient_count: 3, release_at: '2026-10-12T00:00:00+09:00' } as const
    const withRecipe = toCardView(makeCard({ template_type: 'recipe_reveal', resolved_recipe: scheduled }), { now: NOW })
    expect(withRecipe).toMatchObject({ feedType: 'text_box', resource: 'recipe', facts: ['재료 3개', '공개 10월 12일'] })
    for (const resolved_recipe of [null, undefined]) {
      const bare = toCardView(makeCard({ template_type: 'recipe_reveal', resolved_recipe }), { now: NOW })
      expect(bare.feedType).toBe('text_box')
      expect(bare.facts).toBeUndefined()
    }
  })

  it('레시피 값은 레시피 공개 카드만 읽는다 — 다른 카드에 실어도 줄에 번지지 않는다', () => {
    const scheduled = { state: 'scheduled', ingredient_count: 3, release_at: '2026-10-12T00:00:00+09:00' } as const
    expect(toCardView(makeCard({ template_type: 'badge_spotlight', resolved_recipe: scheduled }), { now: NOW }).facts).toBeUndefined()
  })

  it('처음 보는 템플릿 값(안전망)도 던지지 않고 텍스트 박스로 그린다 — 자원·라벨·정보 줄 없이 제목은 그대로다', () => {
    const view = toCardView(makeCard({ template_type: 'future_template' as never, title: '새 소식' }))
    expect(view).toMatchObject({ feedType: 'text_box', title: '새 소식' })
    expect(view.facts).toBeUndefined()
    expect(view.label).toBeUndefined()
  })
})
