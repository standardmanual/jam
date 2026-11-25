import type { ReactNode } from 'react'
import type { FeedCardView, FeedCardViewBadge, FeedCardViewListItem } from '@/lib/today/cardView'
import { resolveFeedLook, type FeedLookCard, type RenderedFeedType } from '@/lib/today/feedLook'
import type { FeedValueChipSource } from '@/lib/today/feedValueChips'
import type { TodayChipSpec } from '@/types/database'

/**
 * 홈피드 개편 카드 Story 공용 재료 (티켓 20261121_0041). Story만 읽는다(앱 코드는 이 파일을 가져오지 않는다).
 *
 * 값은 실제 해석 함수(`resolveFeedLook`)로 만든다 — Story가 화면 값을 손으로 따로 적지 않아 해석 규칙이 바뀌면 Story도 같이 바뀐다.
 * 이미지는 외부 요청 없이 뜨도록 `data:` SVG 가짜 이미지와 `public/badges/sample`의 배지 그림만 쓴다.
 */

const STORY_NOW = new Date('2026-11-21T12:00:00+09:00')

/** 폭 390 화면의 카드 폭(샘플 기준)과 폭 320 화면의 카드 폭 */
const CARD_WIDTH = 358
export const CARD_WIDTH_320 = 288

/** 샘플 이미지(1280×720). 가장자리 잘림과 박스 모양이 눈에 보이도록 줄무늬와 원을 넣었다. */
export function fakeImage(background: string, accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
    `<rect width="1280" height="720" fill="${background}"/>` +
    `<rect y="0" width="1280" height="90" fill="${accent}" opacity="0.35"/>` +
    `<rect y="630" width="1280" height="90" fill="${accent}" opacity="0.35"/>` +
    `<circle cx="640" cy="360" r="190" fill="${accent}"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const IMAGE = fakeImage('#3a5f7d', '#f2c14e')
export const BADGE = '/badges/sample/s142.png'

/** 컬렉션 소개·드랍·픽업이 쓰는 아이템 배지 샘플 그림 5종(`public/badges/sample`, 드랍·픽업의 배지 한도 5). 외부 요청이 없다. */
export const ITEM_BADGES: FeedCardViewBadge[] = [
  { name: '황동 카메라', imageUrl: '/badges/sample/s001.png' },
  { name: '다 쓴 필름통', imageUrl: '/badges/sample/s003.png' },
  { name: '인화 타이머', imageUrl: '/badges/sample/s004.png' },
  { name: '압정 한 줌', imageUrl: '/badges/sample/s005.png' },
  { name: '손때 묻은 열쇠', imageUrl: '/badges/sample/s006.png' },
]

/** 컬렉션 대표 그림 샘플(168×168 정사각) */
export const COLLECTION_ART = fakeImage('#d9c7a3', '#8a5a2b')

const MISSION_VALUES: FeedValueChipSource = {
  resource: 'mission',
  endsAt: '2026-11-23T12:00:00+09:00',
  rewardPoints: 300,
}

export const TWO_CHIPS: TodayChipSpec[] = [
  { kind: 'value', source: 'mission.remaining' },
  { kind: 'label' },
]
export const ONE_CHIP: TodayChipSpec[] = [{ kind: 'phrase', text: '이번 주 미션' }]

export interface StoryCardOptions extends Partial<Omit<FeedLookCard, 'id'>> {
  title?: string
  description?: string
  imageUrl?: string | null
  badgeImageUrl?: string | null
  badgeName?: string
  valueSource?: FeedValueChipSource | null
  /** 컬렉션 소개 */
  collectionName?: string
  collectionBadges?: FeedCardViewBadge[]
  /** 드랍·픽업 */
  itemBadges?: FeedCardViewBadge[]
  /** 목록형 */
  listItems?: FeedCardViewListItem[]
  listMoreHref?: string
  /** true면 계측 정보를 단다(목록형 항목이 링크가 되고 눌림·포커스가 보인다. 홈과 같은 모습) */
  linked?: boolean
}

/** 해석 함수를 거쳐 표시 데이터를 만든다. 지정하지 않은 칸은 자동 규칙(NULL)이다. */
export function feedView(feedType: RenderedFeedType, options: StoryCardOptions = {}): FeedCardView {
  const {
    title = '낙엽 소리 따라\n걷는 한 주',
    description,
    imageUrl = IMAGE,
    badgeImageUrl = null,
    badgeName,
    valueSource = MISSION_VALUES,
    collectionName,
    collectionBadges,
    itemBadges,
    listItems,
    listMoreHref,
    linked = false,
    ...stored
  } = options
  const look = resolveFeedLook({
    card: { id: 'story-card', feed_type: feedType, ...stored },
    feedType,
    valueSource,
    now: STORY_NOW,
  })
  const view: FeedCardView = { resource: 'mission', title, feedType, imageUrl, look }
  if (description && look.showDescription) view.description = description
  if (badgeImageUrl) view.badgeImageUrl = badgeImageUrl
  if (badgeName) view.badgeName = badgeName
  if (collectionName) view.collectionName = collectionName
  if (collectionBadges) view.collectionBadges = collectionBadges
  if (itemBadges) view.itemBadges = itemBadges
  if (listItems) view.listItems = listItems
  if (listMoreHref) view.listMoreHref = listMoreHref
  if (linked) {
    view.href = '/drops'
    view.tracking = { cardId: 'story-card', contentTypeId: null, templateType: 'drop_alert', feedType }
  }
  return view
}

/** 카드 폭 고정 래퍼. 칩이 카드 가장자리에 걸치므로 바깥 여백을 준다. */
export function CardBox({ width = CARD_WIDTH, children }: { width?: number; children: ReactNode }) {
  return (
    <div className="p-4">
      <div style={{ width }}>{children}</div>
    </div>
  )
}

/** 이름표가 붙은 한 칸 */
export function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-foreground break-keep wrap-break-word">{label}</span>
      {children}
    </div>
  )
}

/** 칸을 가로로 늘어놓는 줄 */
export function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-8 p-4">{/* spacing-allow: Story 전용 칸 사이 간격 32px, 서비스 화면이 아님(티켓 20261121_0041) */}{children}</div>
}
