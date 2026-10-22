/**
 * 피드(FeedSection)의 챕터 오름·컬렉션 완성 카드와 상세 시트 (티켓 20261021_1249 6-3 5회, 채원 사전 판정)
 *
 * 저장소에 jsdom·testing-library가 없어(`SuspensionBanner.test.tsx`와 같은 방식) 서버 렌더로 마크업만 고정한다. 가짜 props만 쓰며 공용 DB는 부르지 않는다.
 *
 * 고정하는 것
 *  - 종류 목록 대조: `ActivityFeedEventType`의 모든 값에 아이콘이 있고(`Record`라 빠뜨리면 컴파일 오류), DB enum(`feed_event_type` 생성 타입)과 같은 8개다. 챕터 오름은 메달, 컬렉션 완성은 책이다.
 *    `EventIcon`의 `default`는 `never` 검사라 종류를 빠뜨리면 컴파일 오류가 나고, 런타임에는 모르는 종류가 와도 메달 폴백을 그리며 경고를 한 번만 남긴다.
 *  - 제목 함수(`feedTitle`): 챕터 오름은 «챕터 N»(번호가 정수 1 이상일 때만), 컬렉션 완성은 컬렉션 이름(비면 빈 문자열), 기존 종류는 지금까지와 같다. 카드와 시트가 같은 함수를 쓴다.
 *  - 카드: «라벨(muted) / 대상 이름» 문법. 번호·이름이 손상되면 제목 줄 없이 라벨 한 줄만 그린다(«챕터 0» 금지). 컬렉션은 common이 아니면 등급 칩, common은 칩이 없다. `level`·`earn_count`가 없으니 Lv.N 칩·×N 필이 붙지 않는다.
 *  - 필터: 새 두 종류는 «전체» 탭에서만 보이고 배지·아이템·미션 탭에는 나오지 않는다. 활동 id가 없는 행이라 활동 묶음 카드에 섞이지 않는다.
 *  - 시트: 종류 라벨(muted), 제목 h2, 등급 칩(common 제외), 일시 행 하나, «닫기» 버튼만 있다(«상세» 버튼 없음). 제목이 비면 라벨이 h2 자리에 와서 `aria-labelledby`가 빈 h2를 가리키지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/FeedSection.test.tsx"
 */
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/feed',
  useSearchParams: () => new URLSearchParams(),
}))

import FeedSection, { DetailSheet, EventIcon, feedTitle, matchesFilter } from './FeedSection'
import {
  BookIcon,
  CheckCircleIcon,
  GiftIcon,
  MedalIcon,
  PackageIcon,
  TargetIcon,
  XCircleIcon,
} from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import { Constants } from '@/types/database.generated'
import type { ActivityFeedEventType, ActivityFeedRow } from '@/types/database'

const NOW = '2026-10-22T03:00:00.000Z'

function row(
  eventType: ActivityFeedEventType,
  metadata: Record<string, unknown>,
  extra: Partial<ActivityFeedRow> = {}
): ActivityFeedRow {
  return {
    id: `f-${eventType}`,
    user_id: 'u1',
    event_type: eventType,
    event_at: '2026-10-22T02:00:00.000Z',
    created_at: '2026-10-22T02:00:00.000Z',
    strava_activity_id: null,
    metadata,
    ...extra,
  } as ActivityFeedRow
}

const CHAPTER = row('chapter_up', { chapter_no: 3 })
const COLLECTION_COMMON = row('collection_tier_completed', { collection_id: 'b1', collection_name: '한강 컬렉션', rarity: 'common' })
const COLLECTION_RARE = row('collection_tier_completed', { collection_id: 'b1', collection_name: '한강 컬렉션', rarity: 'rare' })

function renderFeed(items: ActivityFeedRow[]): string {
  return renderToStaticMarkup(<FeedSection feedItems={items} />)
}

function renderSheet(item: ActivityFeedRow): string {
  return renderToStaticMarkup(<DetailSheet item={item} open onClose={() => {}} onClosed={() => {}} badgeLinkQuery="" />)
}

/** 화면 글자만 — 태그를 걷어낸다 */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

function icon(Component: (props: { className?: string }) => ReactNode, className: string): string {
  return renderToStaticMarkup(<Component className={className} />)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// 종류 목록 대조와 아이콘
// ─────────────────────────────────────────────────────────────────────────────

/** 종류마다 기대하는 아이콘. `Record`라 종류를 더하고 여기를 빠뜨리면 컴파일 오류가 난다 */
const EXPECTED_ICON: Record<ActivityFeedEventType, (props: { className?: string }) => ReactNode> = {
  badge_earned: MedalIcon,
  item_dropped: PackageIcon,
  item_picked_up: GiftIcon,
  mission_joined: TargetIcon,
  mission_completed: CheckCircleIcon,
  mission_cancelled: XCircleIcon,
  chapter_up: MedalIcon,
  collection_tier_completed: BookIcon,
}

describe('피드 종류 목록과 아이콘', () => {
  it('코드의 피드 종류 8개가 DB enum(feed_event_type)의 값과 정확히 같다', () => {
    expect(Object.keys(EXPECTED_ICON).sort()).toEqual([...Constants.public.Enums.feed_event_type].sort())
    expect(Object.keys(EXPECTED_ICON)).toHaveLength(8)
  })

  it.each(Object.keys(EXPECTED_ICON) as ActivityFeedEventType[])('%s의 아이콘이 정해진 그림이다', (type) => {
    expect(renderToStaticMarkup(<EventIcon type={type} className="w-5 h-5 text-foreground" />)).toBe(
      icon(EXPECTED_ICON[type], 'w-5 h-5 text-foreground')
    )
  })

  it('책과 메달은 서로 다른 그림이다 — 위 대조가 의미가 있다', () => {
    expect(icon(BookIcon, 'w-5 h-5')).not.toBe(icon(MedalIcon, 'w-5 h-5'))
  })

  it('모르는 종류가 와도 던지지 않고 메달로 그리며, 경고는 종류당 한 번만 남긴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unknown = 'zzz_future_event' as ActivityFeedEventType

    const first = renderToStaticMarkup(<EventIcon type={unknown} className="w-5 h-5" />)
    renderToStaticMarkup(<EventIcon type={unknown} className="w-5 h-5" />)

    expect(first).toBe(icon(MedalIcon, 'w-5 h-5'))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[feed] 미지 피드 종류', { type: 'zzz_future_event' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 제목 함수
// ─────────────────────────────────────────────────────────────────────────────

describe('feedTitle', () => {
  it('챕터 오름은 «챕터 N»이다', () => {
    expect(feedTitle(CHAPTER)).toBe('챕터 3')
    expect(feedTitle(row('chapter_up', { chapter_no: 10 }))).toBe('챕터 10')
  })

  it.each([0, -1, 1.5, Number.NaN, '3', null, undefined])('챕터 번호가 %j이면 «챕터 0» 같은 제목을 만들지 않고 빈 문자열이다', (chapterNo) => {
    expect(feedTitle(row('chapter_up', { chapter_no: chapterNo }))).toBe('')
  })

  it('번호 키가 없어도 빈 문자열이다', () => {
    expect(feedTitle(row('chapter_up', {}))).toBe('')
  })

  it('컬렉션 완성은 컬렉션 이름이고 앞뒤 공백은 지운다', () => {
    expect(feedTitle(COLLECTION_COMMON)).toBe('한강 컬렉션')
    expect(feedTitle(row('collection_tier_completed', { collection_name: '  남산 컬렉션  ' }))).toBe('남산 컬렉션')
  })

  it.each(['', '   ', 3, null, undefined])('컬렉션 이름이 %j이면 빈 문자열이다', (name) => {
    expect(feedTitle(row('collection_tier_completed', { collection_name: name }))).toBe('')
  })

  it('기존 종류는 지금까지와 같다 — 배지 이벤트는 badge_name, 나머지는 mission_title', () => {
    expect(feedTitle(row('badge_earned', { badge_name: '첫 숨결' }))).toBe('첫 숨결')
    expect(feedTitle(row('item_dropped', { badge_name: '파편' }))).toBe('파편')
    expect(feedTitle(row('item_picked_up', { badge_name: '파편' }))).toBe('파편')
    expect(feedTitle(row('mission_joined', { mission_title: '한강 100km' }))).toBe('한강 100km')
    expect(feedTitle(row('mission_completed', { mission_title: '한강 100km' }))).toBe('한강 100km')
    expect(feedTitle(row('mission_cancelled', { mission_title: '한강 100km' }))).toBe('한강 100km')
    expect(feedTitle(row('badge_earned', {}))).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 카드
// ─────────────────────────────────────────────────────────────────────────────

describe('챕터 오름 카드', () => {
  it('«챕터 오름» 라벨(muted) 아래 «챕터 3» 제목(foreground) 두 줄이다', () => {
    const html = renderFeed([CHAPTER])

    expect(html).toContain('text-base text-muted line-clamp-2 break-keep wrap-break-word">챕터 오름</p>')
    expect(html).toContain('text-base text-foreground truncate break-keep wrap-break-word">챕터 3</p>')
    expect(html.indexOf('챕터 오름')).toBeLessThan(html.indexOf('챕터 3<'))
  })

  it('왼쪽은 40x40 중립 타일 안의 메달 아이콘이다', () => {
    const html = renderFeed([CHAPTER])

    expect(html).toContain(
      `<div class="w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center">${icon(MedalIcon, 'w-5 h-5 text-foreground')}</div>`
    )
  })

  it('오른쪽에 상대 시각이 보이고 축하 문구·이모지·등급 칩이 없다', () => {
    const html = renderFeed([CHAPTER])
    const text = visibleText(html)
    expect(text).toContain('1시간 전')
    expect(text).not.toContain('축하')
    expect(html).not.toContain('Common')
    expect(html).not.toContain('×')
  })

  it('번호가 손상되면 제목 줄 없이 라벨 한 줄만 그린다 — «챕터 0»이 없다', () => {
    for (const chapterNo of [0, -2, 2.5, '3', null]) {
      const broken = renderFeed([row('chapter_up', { chapter_no: chapterNo })])

      expect(visibleText(broken)).toContain('챕터 오름')
      expect(visibleText(broken)).not.toContain('챕터 0')
      expect(broken).not.toContain('text-foreground truncate')
    }
  })
})

describe('컬렉션 완성 카드', () => {
  it('«컬렉션 완성» 라벨 아래 컬렉션 이름이 한 줄 말줄임으로 보이고, 왼쪽은 책 아이콘 타일이다', () => {
    const html = renderFeed([COLLECTION_COMMON])

    expect(html).toContain('text-base text-muted line-clamp-2 break-keep wrap-break-word">컬렉션 완성</p>')
    expect(html).toContain('text-base text-foreground truncate break-keep wrap-break-word">한강 컬렉션</p>')
    expect(html).toContain(
      `<div class="w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center">${icon(BookIcon, 'w-5 h-5 text-foreground')}</div>`
    )
  })

  it('common이면 등급 칩이 없다 — «Common»을 따로 그리지 않는다', () => {
    expect(renderFeed([COLLECTION_COMMON])).not.toContain('Common')
  })

  it('rare 이상이면 등급 칩이 이름 아래에 보인다', () => {
    const html = renderFeed([COLLECTION_RARE])

    expect(visibleText(html)).toContain('Rare')
    expect(html.indexOf('한강 컬렉션')).toBeLessThan(html.indexOf('Rare'))
  })

  it.each(['epic', 'mystic'] as const)('%s 등급도 등급 칩이 보인다', (rarity) => {
    const html = renderFeed([row('collection_tier_completed', { collection_name: '한강 컬렉션', rarity })])

    expect(visibleText(html)).toContain(rarity === 'epic' ? 'Epic' : 'Mystic')
  })

  it('Lv.N 칩이나 ×N 필이 붙지 않는다 — 메타에 level·earn_count가 없다', () => {
    const html = renderFeed([COLLECTION_RARE])

    expect(html).not.toContain('Lv.')
    expect(html).not.toContain('×')
  })

  it('이름이 비면 제목 줄 없이 라벨만 그리고, 등급 칩은 그대로 판정한다', () => {
    const html = renderFeed([row('collection_tier_completed', { collection_name: '', rarity: 'rare' })])

    expect(visibleText(html)).toContain('컬렉션 완성')
    expect(html).not.toContain('text-foreground truncate')
    expect(visibleText(html)).toContain('Rare')
  })
})

describe('두 종류가 함께 있을 때', () => {
  it('활동 id가 없는 행이라 활동 묶음 카드에 섞이지 않고 각각 한 카드다', () => {
    const html = renderFeed([CHAPTER, COLLECTION_COMMON, row('chapter_up', { chapter_no: 4 }, { id: 'f-2' })])

    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('t-acc')
    // 필터 탭 버튼 4개를 뺀 카드(`jam-press` 행)가 셋이다
    expect((html.match(/jam-press/g) ?? []).length).toBe(3)
  })

  it('«전체» 탭에서만 보인다 — 배지·아이템·미션 탭에는 나오지 않는다', () => {
    for (const item of [CHAPTER, COLLECTION_COMMON, COLLECTION_RARE]) {
      expect(matchesFilter(item, 'all')).toBe(true)
      expect(matchesFilter(item, 'badge')).toBe(false)
      expect(matchesFilter(item, 'mission')).toBe(false)
      expect(matchesFilter(item, 'activity_badge')).toBe(false)
    }
  })

  it('기존 종류의 필터는 그대로다', () => {
    expect(matchesFilter(row('badge_earned', {}), 'activity_badge')).toBe(true)
    expect(matchesFilter(row('item_dropped', {}), 'badge')).toBe(true)
    expect(matchesFilter(row('mission_completed', {}), 'mission')).toBe(true)
    expect(matchesFilter(row('badge_earned', {}), 'badge')).toBe(false)
  })

  it('피드가 비면 기존 빈 상태 안내가 보인다', () => {
    expect(visibleText(renderFeed([]))).toContain(d.feed.emptyTitle)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 상세 시트
// ─────────────────────────────────────────────────────────────────────────────

describe('상세 시트', () => {
  it('챕터 오름: 112px 메달 타일, 라벨, 제목 h2, 일시 행 하나, 닫기 버튼만 있다', () => {
    const html = renderSheet(CHAPTER)

    expect(html).toContain(
      `<div class="w-28 h-28 rounded-2xl bg-surface text-foreground flex items-center justify-center">${icon(MedalIcon, 'w-12 h-12')}</div>`
    )
    expect(html).toContain('text-center text-base text-muted mb-1 line-clamp-2 break-keep wrap-break-word">챕터 오름</p>')
    expect(html).toMatch(/<h2 id="[^"]+" class="[^"]*text-balance">챕터 3<\/h2>/)
    expect(html).toContain(d.feed.rowDate)
    expect((html.match(new RegExp(`>${d.feed.rowDate}<`, 'g')) ?? []).length).toBe(1)
    expect(visibleText(html)).toContain(d.common.close)
    expect(visibleText(html)).not.toContain(d.common.detail)
    expect((html.match(/<button/g) ?? []).length).toBe(1)
  })

  it('시트 안의 다른 행(장소·결과·보상·포인트)은 만들지 않는다', () => {
    const text = visibleText(renderSheet(COLLECTION_RARE))

    for (const label of [d.feed.rowPlace, d.feed.rowCheckinPlace, d.feed.rowResult, d.feed.rowRewardBadges, d.feed.rowRewardPoints, d.feed.rowPoints]) {
      expect(text).not.toContain(label)
    }
  })

  it('컬렉션 완성: 컬렉션 이름이 h2이고 common이면 등급 칩이 없다', () => {
    const html = renderSheet(COLLECTION_COMMON)

    expect(html).toMatch(/<h2 id="[^"]+" class="[^"]*">한강 컬렉션<\/h2>/)
    expect(html).toContain(icon(BookIcon, 'w-12 h-12'))
    expect(html).not.toContain('Common')
    expect(visibleText(html)).toContain('컬렉션 완성')
  })

  it('컬렉션 완성: rare 이상이면 등급 칩이 제목 아래에 보인다', () => {
    const html = renderSheet(COLLECTION_RARE)

    expect(visibleText(html)).toContain('Rare')
    expect(html.indexOf('</h2>')).toBeLessThan(html.indexOf('Rare'))
  })

  it('aria-labelledby는 제목 h2를 가리킨다', () => {
    const html = renderSheet(CHAPTER)
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1]
    const h2Id = html.match(/<h2 id="([^"]+)"/)?.[1]

    expect(labelledBy).toBeTruthy()
    expect(labelledBy).toBe(h2Id)
  })

  it.each([
    ['챕터 오름', row('chapter_up', { chapter_no: 0 }), '챕터 오름'],
    ['컬렉션 완성', row('collection_tier_completed', { collection_name: '' }), '컬렉션 완성'],
  ])('제목이 비면(%s) 라벨이 h2 자리에 와서 빈 h2를 가리키지 않고, muted 라벨 줄은 그리지 않는다', (_name, item, label) => {
    const html = renderSheet(item)
    const h2 = html.match(/<h2 id="([^"]+)"[^>]*>([^<]*)<\/h2>/)

    expect(h2?.[2]).toBe(label)
    expect(html.match(/aria-labelledby="([^"]+)"/)?.[1]).toBe(h2?.[1])
    expect(html).not.toContain('text-center text-base text-muted mb-1')
  })

  it('기존 배지 획득 시트는 그대로다 — 라벨 줄, 배지 이름 h2, 상세 버튼', () => {
    const html = renderSheet(row('badge_earned', { badge_id: 'b1', badge_name: '첫 숨결', badge_image_url: null, rarity: 'rare' }))

    expect(html).toContain('text-center text-base text-muted mb-1 line-clamp-2 break-keep wrap-break-word">배지 획득</p>')
    expect(html).toMatch(/<h2 id="[^"]+" class="[^"]*">첫 숨결<\/h2>/)
    expect(visibleText(html)).toContain(d.common.detail)
  })
})
