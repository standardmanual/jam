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
 * 티켓 20261106_2252: 카드는 `ListRow`(서비스 사본)다. 마크업은 슬롯 스타일로 고정한다 — eyebrow(12px muted) `font-weight:400`, 제목(16px 굵게) `font-weight:700`.
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

import FeedSection, { DetailSheet, EventIcon, eventLabelText, feedImageOf, feedTarget, feedTitle, goToFeedTarget, matchesFilter } from './FeedSection'
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

/** ListRow 슬롯 조각 — eyebrow·시간은 굵기 400, 제목은 700으로 그려진다 */
const eyebrowOf = (text: string) => `font-weight:400">${text}</span>`
const titleOf = (text: string) => `font-weight:700">${text}</span>`

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
  it('«챕터 오름» 라벨(muted) 아래 «챕터 3» 제목(굵게) 두 줄이다', () => {
    const html = renderFeed([CHAPTER])

    expect(html).toContain(eyebrowOf('챕터 오름'))
    expect(html).toContain(titleOf('챕터 3'))
    expect(html.indexOf('챕터 오름')).toBeLessThan(html.indexOf('챕터 3<'))
  })

  it('대표 이미지가 없는 행이라 왼쪽 아이콘 칸 없이 글만 보인다', () => {
    const html = renderFeed([CHAPTER]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).not.toContain('ds-list-row-lead')
    expect(html).not.toContain('w-10 h-10')
    expect(html).not.toContain('bg-background-secondary')
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
      // 제목 줄(굵기 700)이 없고, 빈 제목 줄을 만들지 않는다
      expect(broken).not.toContain('font-weight:700')
    }
  })
})

describe('컬렉션 완성 카드', () => {
  it('«컬렉션 완성» 라벨 아래 컬렉션 이름이 한 줄 말줄임으로 보이고, 이미지가 없으면 왼쪽 칸이 없다', () => {
    const html = renderFeed([COLLECTION_COMMON]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).toContain(eyebrowOf('컬렉션 완성'))
    expect(html).toContain(titleOf('한강 컬렉션'))
    expect(html).not.toContain('ds-list-row-lead')
    expect(html).toContain('white-space:nowrap')
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
    expect(html).not.toContain('text-overflow:ellipsis')
    expect(visibleText(html)).toContain('Rare')
  })
})

describe('두 종류가 함께 있을 때', () => {
  it('활동 id가 없는 행이라 활동 묶음 카드에 섞이지 않고 각각 한 카드다', () => {
    const html = renderFeed([CHAPTER, COLLECTION_COMMON, row('chapter_up', { chapter_no: 4 }, { id: 'f-2' })])

    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('t-acc')
    // 필터 탭 버튼 4개를 뺀 카드(ListRow 행)가 셋이다
    expect((html.match(/class="ds-list-row"/g) ?? []).length).toBe(3)
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
// ListRow로 옮긴 활동 행·활동 묶음 행 (티켓 20261106_2252)
// ─────────────────────────────────────────────────────────────────────────────

const CHECKIN_REPEAT = row('badge_earned', { badge_id: 'b1', badge_name: '한강 체크인', poi_name: '반포', visit_count: 3 })
const ACTIVITY_BADGE_REPEAT = row('badge_earned', { badge_id: 'b2', badge_name: '아침 러너', earn_count: 4 })

describe('eventLabelText — 카드 라벨은 평문 문자열이다', () => {
  it('첫 체크인·N번째 체크인·활동 배지 N번째·나머지 종류가 ko.ts 문구와 같다', () => {
    expect(eventLabelText(row('badge_earned', { poi_name: '반포', visit_count: 1 }))).toBe(d.feed.eventCheckin)
    expect(eventLabelText(CHECKIN_REPEAT)).toBe('3번째 체크인 했어요')
    expect(eventLabelText(ACTIVITY_BADGE_REPEAT)).toBe('4번째 획득했어요')
    expect(eventLabelText(row('badge_earned', {}))).toBe(d.feed.eventBadgeEarned)
    expect(eventLabelText(row('item_dropped', { tribe_name: '아스팔트 레인저' }))).toBe(d.feed.eventItemEarned)
    expect(eventLabelText(row('item_dropped', {}))).toBe(d.feed.eventItemDropped)
    expect(eventLabelText(row('item_picked_up', {}))).toBe(d.feed.eventItemPickedUp)
    expect(eventLabelText(row('mission_joined', {}))).toBe(d.feed.eventMissionJoined)
    expect(eventLabelText(row('mission_completed', {}))).toBe(d.feed.eventMissionCompleted)
    expect(eventLabelText(row('mission_cancelled', {}))).toBe(d.feed.eventMissionCancelled)
    expect(eventLabelText(CHAPTER)).toBe(d.feed.eventChapterUp)
    expect(eventLabelText(COLLECTION_COMMON)).toBe(d.feed.eventCollectionTierCompleted)
  })
})

describe('활동 행(FeedCard) — ListRow', () => {
  it('반복 획득: «N번째»는 숫자 강조 없이 한 덩어리 문장이고, 시간이 같은 줄 오른쪽에 있으며, 이미지가 없으면 ×N은 칩이다', () => {
    const html = renderFeed([CHECKIN_REPEAT]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).toContain(eyebrowOf('3번째 체크인 했어요'))
    expect(html).not.toContain('<strong')
    // eyebrow 줄(space-between) 안에서 라벨 바로 뒤에 시간이 온다
    expect(html).toMatch(/3번째 체크인 했어요<\/span><span style="flex-shrink:0;white-space:nowrap[^"]*">1시간 전<\/span>/)
    expect(html).toContain('>×3</span>')
    // 옛 카드 모양(40×40 타일·18px 필·trailing 시각)이 남지 않는다
    expect(html).not.toContain('w-10 h-10')
    expect(html).not.toContain('min-w-[18px]')
  })

  it('활동 배지 반복(earn_count)도 ×N과 «N번째 획득했어요»가 붙는다', () => {
    const html = renderFeed([ACTIVITY_BADGE_REPEAT])

    expect(html).toContain(eyebrowOf('4번째 획득했어요'))
    expect(html).toContain('>×4</span>')
  })

  it('배지 이미지는 장식(alt="")이고 제목은 본문 텍스트로 한 번만 읽힌다', () => {
    const html = renderFeed([row('badge_earned', { badge_name: '아침 러너', badge_image_url: '/badge.png' })])

    expect(html).toContain('alt=""')
    expect(html).not.toContain('alt="아침 러너"')
    expect(html).toContain(titleOf('아침 러너'))
  })

  it('이미지가 없으면 아이콘 칸도 그리지 않고 글만 보인다 (2026-11-09 결정)', () => {
    const html = renderFeed([row('badge_earned', { badge_name: '아침 러너' })]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).not.toContain('ds-list-row-lead')
    expect(html).not.toContain('<svg')
    expect(html).toContain(titleOf('아침 러너'))
  })

  it('이미지가 없는 반복 행은 ×N을 lead 모서리 대신 칩으로 보인다', () => {
    const html = renderFeed([row('badge_earned', { badge_name: '아침 러너', earn_count: 4 })]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).not.toContain('ds-list-row-lead')
    expect(html).toContain('>×4</span>')
  })

  it('1번만 얻은 행은 이미지가 없어도 ×N 칩이 없다', () => {
    const html = renderFeed([row('badge_earned', { badge_name: '아침 러너', earn_count: 1 })]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).not.toContain('×1')
  })

  it('제목 줄은 1줄 말줄임 스타일이다(nowrap·ellipsis·hidden)', () => {
    const html = renderFeed([row('badge_earned', { badge_name: '아주 긴 배지 이름'.repeat(8) })])

    expect(html).toContain(
      'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1 1 auto;font-size:var(--text-base);line-height:var(--text-base--line-height);font-weight:700'
    )
  })

  it('칩이 없으면 칩 줄을, 부제가 없으면 부제 줄을 그리지 않는다 — 빈 줄·여백이 없다', () => {
    // 컴포넌트가 함께 내보내는 <style>의 규칙은 마크업이 아니라서 걷어 내고 본다
    const html = renderFeed([row('badge_earned', { badge_name: '아침 러너', rarity: 'common' })]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).not.toContain('margin-top:var(--spacing-4)')
    expect(html).not.toContain('font-size:var(--text-sm)')
  })

  it('부제(장소)와 등급 칩이 있으면 제목 아래 부제 14px, 그 아래 칩 줄이다', () => {
    const html = renderFeed([row('item_picked_up', { badge_name: '파편', poi_name: '반포 한강공원', rarity: 'rare' })])

    expect(html).toContain('font-size:var(--text-sm)')
    expect(visibleText(html)).toContain('반포 한강공원')
    expect(html.indexOf('반포 한강공원')).toBeLessThan(html.indexOf('Rare'))
    expect(html).toContain('margin-top:var(--spacing-4)')
  })

  it('«마지막 파편!»은 neutral 칩이고 퍼즐 아이콘이 앞에 온다 — 한 행에서 색 강조는 등급 칩 쪽뿐이다', () => {
    const html = renderFeed([row('item_dropped', { badge_name: '파편', tribe_name: '아스팔트 레인저', is_last_piece: true })])

    expect(html).toContain(d.feed.lastPiece)
    expect(html).toMatch(/background:var\(--default-soft\)[^>]*><svg[^>]*class="w-3 h-3"/)
    expect(html).not.toContain('var(--accent-soft)')
    expect(html).not.toContain('var(--warning)')
  })

  it('행 안(lead)에는 div가 없다 — button 안에서 마크업이 유효하다', () => {
    const html = renderFeed([row('badge_earned', { badge_name: '아침 러너', badge_image_url: '/badge.png', earn_count: 2 })])
    const hit = html.slice(html.indexOf('<button type="button" class="ds-list-row-hit"'), html.indexOf('</button>'))

    expect(hit).not.toContain('<div')
  })
})

describe('활동 묶음 행(ActivityGroupCard) — ListRow media', () => {
  const A = row('badge_earned', { badge_id: 'b1', badge_name: '아침 러너', badge_image_url: '/a.png' }, { id: 'g-1', strava_activity_id: 77 })
  const B = row('item_dropped', { badge_id: 'b2', badge_name: '파편', badge_image_url: null }, { id: 'g-2', strava_activity_id: 77 })
  const renderGroup = (names?: Record<string, string>) =>
    renderToStaticMarkup(<FeedSection feedItems={[A, B]} activityNames={names} />)

  it('쉐브론 없이 aria-expanded=false와 aria-controls가 패널 id로 연결되고, 접힌 패널은 inert다', () => {
    const html = renderGroup({ '77': '아침 한강 러닝' })
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1]

    expect(html).toContain('aria-expanded="false"')
    expect(controls).toBeTruthy()
    expect(html).toContain(`id="${controls}" class="t-acc-panel"`)
    expect(html).toMatch(/class="t-acc-panel-inner -mr-1" inert=""/)
    // 쉐브론(ChevronRightIcon 경로)이 없다
    expect(html).not.toContain('M9 5l7 7-7 7')
    expect(html).not.toContain('t-acc-chevron')
  })

  it('하위 항목은 헤더와 같은 Card 한 장 안에 있고, 각자 테두리 대신 구분선만 가진다 (티켓 20261108_1830)', () => {
    const html = renderGroup({ '77': '아침 한강 러닝' })
    const cardStart = html.indexOf('class="t-acc"')
    const card = html.slice(html.lastIndexOf('<div', cardStart))

    // 바깥 면은 하나(1px --border), 패널은 그 자손이다
    expect(card.indexOf('border:1px solid var(--border)')).toBeLessThan(card.indexOf('class="t-acc-panel"'))
    const panel = card.slice(card.indexOf('class="t-acc-panel"'))
    // 패널 안 행은 flat이라 자기 면·--border 테두리가 없다
    expect(panel).not.toContain('border:1px solid var(--border)')
    expect(panel).not.toContain('var(--surface)')
    // 마지막 항목을 뺀 첫 항목에만 구분선이 있다
    expect(panel.match(/border-bottom:1px solid var\(--separator\)/g)).toHaveLength(1)
  })

  it('media라 lead가 위쪽 정렬이고, 활동 이름은 eyebrow·헤드라인은 제목이다', () => {
    const html = renderGroup({ '77': '아침 한강 러닝' })

    expect(html).toContain('display:flex;align-items:flex-start;flex:1 1 auto')
    expect(html).toContain(eyebrowOf('아침 한강 러닝'))
    expect(html).toContain(titleOf(d.feed.groupBadges.replace('{count}', '2')))
  })

  it('활동 이름이 없으면 eyebrow 줄이 없고 시간이 제목 줄 오른쪽으로 간다', () => {
    // 패널 안 활동 행에는 eyebrow가 있으므로 묶음 헤더(패널 앞)만 본다
    const html = renderGroup().split('class="t-acc-panel"')[0]
    const titleRow = html.slice(html.indexOf('align-items:baseline'))

    expect(html).not.toContain('justify-content:space-between;gap:var(--spacing-8)')
    expect(titleRow).toMatch(/font-weight:700">[^<]*<\/span><span style="flex-shrink:0;white-space:nowrap[^"]*">1시간 전<\/span>/)
  })

  it('썸네일 줄은 footer로 가고 aria-hidden이다', () => {
    const html = renderGroup({ '77': '아침 한강 러닝' })

    expect(html).toContain('<span style="display:block;margin-top:var(--spacing-8)"><span class="inline-flex items-center gap-1" aria-hidden="true">')
  })

  it('썸네일이 하나도 없으면 footer를 그리지 않는다', () => {
    const noImage = (r: ActivityFeedRow) => ({ ...r, metadata: { ...(r.metadata as object), badge_image_url: null } }) as ActivityFeedRow
    const html = renderToStaticMarkup(<FeedSection feedItems={[noImage(A), noImage(B)]} />)

    expect(html).not.toContain('margin-top:var(--spacing-8)"><span class="inline-flex')
  })

  it('펼친 패널 안에는 같은 ListRow 행이 쌓인다', () => {
    const html = renderGroup()

    // 묶음 헤더 1 + 패널 안 활동 행 2
    expect((html.match(/class="ds-list-row"/g) ?? []).length).toBe(3)
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

  it('반복 체크인 시트는 «N번째» 숫자를 계속 강조한다 — 카드만 평문이다', () => {
    const html = renderSheet(CHECKIN_REPEAT)

    expect(html).toContain('<strong class="font-bold text-foreground">3</strong>')
  })

  it('기존 배지 획득 시트는 그대로다 — 라벨 줄, 배지 이름 h2, 상세 버튼', () => {
    const html = renderSheet(row('badge_earned', { badge_id: 'b1', badge_name: '첫 숨결', badge_image_url: null, rarity: 'rare' }))

    expect(html).toContain('text-center text-base text-muted mb-1 line-clamp-2 break-keep wrap-break-word">배지 획득</p>')
    expect(html).toMatch(/<h2 id="[^"]+" class="[^"]*">첫 숨결<\/h2>/)
    expect(visibleText(html)).toContain(d.common.detail)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 포인트 표기 — «값 포인트» 조각만 point-text 오렌지 (티켓 20261104_2319 2회차)
// ─────────────────────────────────────────────────────────────────────────────

function pointPieces(html: string): string[] {
  return Array.from(html.matchAll(/<span class="text-point-text"[^>]*>(.*?)<\/span>/g)).map((m) => m[1])
}

describe('피드의 포인트 표기', () => {
  const MISSION = row('mission_completed', { mission_title: '주말 러너', reward_points: 300 })
  const BADGE = row('badge_earned', { badge_name: '한강 러너', point_reward: 50 })

  it('미션 완료 카드 부제는 «+300 포인트» 조각만 칠하고 문장 글자는 그대로다', () => {
    const html = renderFeed([MISSION])
    expect(pointPieces(html)).toEqual(['+300 포인트'])
    expect(visibleText(html)).toContain('+300 포인트')
  })

  it('상세 시트의 보상 행은 두 곳 모두 값과 단위를 칠한다', () => {
    expect(pointPieces(renderSheet(MISSION))).toEqual(['300 포인트'])
    expect(pointPieces(renderSheet(BADGE))).toEqual(['+50 포인트'])
  })
})

describe('FeedSection 머리 줄 (티켓 20261106_1734)', () => {
  it('기본은 제목(최근 활동)과 개수 줄을 그린다 — 친구 활동 화면이 이 모양이다', () => {
    const html = renderToStaticMarkup(<FeedSection feedItems={[CHAPTER]} />)
    expect(visibleText(html)).toContain(d.feed.title)
    expect(visibleText(html)).toContain('1개')
  })

  it('hideHeader면 제목·개수 줄이 화면에서 사라지고 제목은 스크린리더용으로만 남는다 — 내 프로필이 이 모양이다', () => {
    const html = renderToStaticMarkup(<FeedSection feedItems={[CHAPTER]} hideHeader />)
    expect(html).toContain(`<h2 class="sr-only">${d.feed.title}</h2>`)
    expect(html).not.toContain('text-2xl text-foreground">' + d.feed.title)
    expect(visibleText(html)).not.toContain('1개')
  })
})

describe('피드 카드를 누르면 가는 곳 (feedTarget) — 바텀시트 대신 상세 페이지', () => {
  it('배지 획득은 배지 상세로 가고 타인 프로필이면 ?u= 가 붙는다', () => {
    const item = row('badge_earned', { badge_id: 'b9', badge_name: 'x' })
    expect(feedTarget(item)).toEqual({ kind: 'href', href: '/badges/b9' })
    expect(feedTarget(item, '?u=god')).toEqual({ kind: 'href', href: '/badges/b9?u=god' })
  })

  it('아이템 픽업과 아이템 드랍은 둘 다 그 아이템 배지의 상세로 간다 — 드랍은 지점 정보가 없다', () => {
    expect(feedTarget(row('item_picked_up', { badge_id: 'i1' }))).toEqual({ kind: 'href', href: '/badges/i1' })
    expect(feedTarget(row('item_dropped', { badge_id: 'i2', poi_name: '' }))).toEqual({ kind: 'href', href: '/badges/i2' })
  })

  it('미션 참여·완료·취소는 미션 상세로 간다', () => {
    for (const t of ['mission_joined', 'mission_completed', 'mission_cancelled'] as const) {
      expect(feedTarget(row(t, { mission_id: 'm1' }))).toEqual({ kind: 'href', href: '/missions/m1' })
    }
  })

  it('컬렉션 완성은 컬렉션 상세로 간다', () => {
    expect(feedTarget(COLLECTION_COMMON)).toEqual({ kind: 'href', href: '/collections/b1' })
    expect(feedTarget(COLLECTION_COMMON, '?u=god')).toEqual({ kind: 'href', href: '/collections/b1?u=god' })
  })

  it('챕터 오름은 갈 페이지가 없어 «맨 위로»다', () => {
    expect(feedTarget(CHAPTER)).toEqual({ kind: 'top' })
  })

  it('갈 곳의 id가 비어 있으면 null이고 아무 일도 하지 않는다', () => {
    expect(feedTarget(row('badge_earned', { badge_id: '' }))).toBeNull()
    expect(feedTarget(row('mission_joined', {}))).toBeNull()
    expect(feedTarget(row('collection_tier_completed', { collection_name: 'x' }))).toBeNull()
    const push = vi.fn()
    goToFeedTarget(null, push)
    expect(push).not.toHaveBeenCalled()
  })

  it('goToFeedTarget: href는 push하고, top은 창을 맨 위로 올린다', () => {
    const push = vi.fn()
    goToFeedTarget({ kind: 'href', href: '/badges/b9' }, push)
    expect(push).toHaveBeenCalledWith('/badges/b9')
    const scrollTo = vi.fn()
    vi.stubGlobal('window', { scrollTo, matchMedia: () => ({ matches: false }) })
    goToFeedTarget({ kind: 'top' }, push)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    vi.unstubAllGlobals()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 대표 이미지 — 미션·컬렉션 이벤트는 그 대상의 이미지를 쓰고, 활동 묶음 카드는 이미지 영역이 없다 (2026-11-09 사용자 지시)
// ─────────────────────────────────────────────────────────────────────────────
describe('피드 행의 대표 이미지 (feedImageOf)', () => {
  it('배지 → 미션 → 컬렉션 순으로 있는 값을 쓰고 없으면 null이다', () => {
    expect(feedImageOf({ badge_image_url: '/b.png', mission_image_url: '/m.png' })).toBe('/b.png')
    expect(feedImageOf({ mission_image_url: '/m.png' })).toBe('/m.png')
    expect(feedImageOf({ collection_image_url: '/c.png' })).toBe('/c.png')
    expect(feedImageOf({ badge_image_url: '', mission_image_url: null })).toBeNull()
    expect(feedImageOf({})).toBeNull()
  })

  it('미션 참가 행은 미션 대표 이미지를 이미지 칸에 그리고, 이미지가 없으면 이미지 칸이 없다', () => {
    const withImage = renderFeed([row('mission_joined', { mission_id: 'm1', mission_title: '첫 산행', mission_image_url: 'https://example.com/m1.png' })])
    const without = renderFeed([row('mission_joined', { mission_id: 'm2', mission_title: '첫 산행' })])

    expect(withImage).toContain('m1.png')
    expect(without).not.toContain('<img')
    expect(without.replace(/<style[\s\S]*?<\/style>/g, '')).not.toContain('ds-list-row-lead')
  })

  it('컬렉션 등급 완성 행은 컬렉션 대표 이미지를 쓴다', () => {
    const html = renderFeed([row('collection_tier_completed', { collection_id: 'b1', collection_name: '한강 컬렉션', rarity: 'rare', collection_image_url: 'https://example.com/book.png' })])

    expect(html).toContain('book.png')
  })

  it('상세 시트도 같은 이미지를 쓴다', () => {
    const html = renderSheet(row('mission_joined', { mission_id: 'm1', mission_title: '첫 산행', mission_image_url: 'https://example.com/m1.png' }))

    expect(html).toContain('m1.png')
  })
})

describe('활동 묶음 카드 — 이미지 영역 없음 (2026-11-09 사용자 지시)', () => {
  const A = row('badge_earned', { badge_id: 'b1', badge_name: '아침 러너', badge_image_url: '/a.png' }, { id: 'g-1', strava_activity_id: 77 })
  const B = row('item_dropped', { badge_id: 'b2', badge_name: '파편', badge_image_url: null }, { id: 'g-2', strava_activity_id: 77 })

  it('묶음 헤더에는 활동 아이콘 타일(lead)이 없고 글만 있다', () => {
    // `ListRow`가 자기 CSS를 `<style>`로 함께 내보낸다 — 그 안의 클래스 이름은 화면 요소가 아니라서 걷고 본다
    const html = renderToStaticMarkup(<FeedSection feedItems={[A, B]} activityNames={{ '77': '아침 한강 러닝' }} />).replace(/<style[\s\S]*?<\/style>/g, '')
    const header = html.split('class="t-acc-panel"')[0]

    expect(header).not.toContain('ds-list-row-lead')
    expect(header).toContain('아침 한강 러닝')
    expect(visibleText(header)).toContain(d.feed.groupBadges.replace('{count}', '2'))
    // 헤드라인 아래 썸네일 줄(footer)은 그대로다
    expect(header).toContain('inline-flex items-center gap-1')
  })

  it('묶음을 펼친 안의 개별 행은 이미지가 있는 행만 이미지 칸을 둔다', () => {
    const html = renderToStaticMarkup(<FeedSection feedItems={[A, B]} />).replace(/<style[\s\S]*?<\/style>/g, '')
    const panel = html.slice(html.indexOf('class="t-acc-panel"'))

    expect((panel.match(/ds-list-row-lead/g) ?? []).length).toBe(1)
  })

  it('활동 묶음이 아닌 단건 행도 이미지가 없으면 이미지 칸이 없다', () => {
    const html = renderFeed([row('item_dropped', { badge_name: '핫도그', poi_name: '쌍용마트' })]).replace(/<style[\s\S]*?<\/style>/g, '')

    expect(html).not.toContain('ds-list-row-lead')
  })
})

