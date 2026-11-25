/**
 * 홈이 카드 한 장을 어느 유형으로 그리는가 (티켓 20261122_1101, 상위 20261122_1100 8회차-1).
 *
 * 옛 7모양을 걷어 홈은 새 유형 8가지만 그린다. `feed_type`이 비었거나 모르는 값(꺼진 `full_image` 포함)이면 텍스트 박스다.
 * 컬렉션 소개·드랍·픽업·목록형은 그릴 값(커버·아이템 배지·목록 항목)이 없으면 그 행도 텍스트 박스로 그려 화면이 비지 않는다.
 *
 * 화면(`toCardView`)과 계측(`events.ts`의 `today_card_events.card_shape`)이 같은 규칙을 쓰도록 이 한 파일에 둔다 — 기록 유형 = 화면 유형.
 * 서버 모듈·한국어 사전을 값으로 가져오지 않는 순수 파일이다(`__tests__/eventsImports.test.ts`가 import 그래프로 고정한다).
 */
import type { TodayListItem } from '@/types/database'
import { FEED_GALLERY } from './feedConstants'
import { isRenderedFeedType, type RenderedFeedType } from './feedLook'

/** `feed_type`이 비었거나 모르는 값, 또는 그릴 값이 없을 때 그리는 유형. */
const FEED_FALLBACK_TYPE: RenderedFeedType = 'text_box'

/** 목록형 항목 중 그릴 수 있는 것(이름·주소가 비어 있지 않은 것)만 앞에서 `FEED_GALLERY.maxItems`개까지. */
export function usableListItems(items: readonly TodayListItem[] | null | undefined): TodayListItem[] {
  const result: TodayListItem[] = []
  for (const item of items ?? []) {
    if (!item?.name?.trim() || !item.href?.trim()) continue
    result.push(item)
    if (result.length >= FEED_GALLERY.maxItems) break
  }
  return result
}

/** 유형별로 그릴 값이 있는지 알려 주는 입력. 값이 없는 칸은 0·false로 넘긴다. */
export interface FeedTypeValues {
  /** 카드의 커버 이미지가 있는가(컬렉션 소개의 대표 그림) */
  hasCover: boolean
  /** 드랍·픽업 박스에 담을 배지 수 */
  itemBadgeCount: number
  /** 목록형의 그릴 수 있는 항목 수(`usableListItems`의 길이) */
  listItemCount: number
}

/** 카드 한 장의 홈 유형을 정한다. */
export function resolveFeedType(feedType: unknown, values: FeedTypeValues): RenderedFeedType {
  if (!isRenderedFeedType(feedType)) return FEED_FALLBACK_TYPE
  switch (feedType) {
    case 'collection_intro':
      return values.hasCover ? feedType : FEED_FALLBACK_TYPE
    case 'drop_pickup':
      return values.itemBadgeCount > 0 ? feedType : FEED_FALLBACK_TYPE
    case 'gallery_list':
      return values.listItemCount > 0 ? feedType : FEED_FALLBACK_TYPE
    default:
      return feedType
  }
}
