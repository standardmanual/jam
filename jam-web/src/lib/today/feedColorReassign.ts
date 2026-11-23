/**
 * 저장된 홈피드 카드의 색 일회성 재배정 계산 (티켓 20261122_2224 회차 10, 상위 20261122_2217 결정 9).
 *
 * 통합 팔레트 규칙(`assignFeedColors`)을 «새 카드를 등록할 때 서버가 넘기는 입력과 같은 입력»으로 카드마다 다시 돌린다.
 * 카드를 «등록 시각 → 노출 시작 → id» 순으로 차례로 처리하고, 이미 처리한 카드의 새 바탕 키를 앞 카드 목록(`recentBgKeys`)으로 넘긴다.
 *
 * - 앞 카드 목록: 이미 처리한 카드 중 노출 기간이 겹치는 카드(`starts_at <= 이 카드 ends_at AND ends_at >= 이 카드 starts_at`,
 *   `feedCardServer.ts` `fetchRecentBgKeys`와 같은 조건)의 새 바탕 키를 처리 순서대로 최근 `FEED_RECENT_BG_LIMIT`장.
 * - 시드: 카드의 `feed_seed` 그대로(`decideFeedCardValues`가 `columns.feed_seed ?? seed`를 `assignFeedColors`에 넘기는 것과 같다).
 * - 글자 박스: `boxHasTextFor(feedType, boxKind)`. 저장된 `box_kind`는 모두 NULL이라 `resolveBoxKind`의 유형 기본값을 따른다.
 * - 이미지 색: `imageColorsForCard`가 읽는 방식 그대로 만든다. 재료에는 첫 배지 대표 색(`badgeColors`)만 있어 배지 소개만 규칙 ⑤가 걸리고,
 *   히어로의 커버 대표 색(`cover_colors`)은 재료에 없어 이미지 규칙 없이 정한다(서버가 `cover_colors`가 NULL인 카드를 정할 때와 같다).
 * - 운영자가 손으로 고른 옛 색도 모두 바뀐다(결정): `fixed`는 넘기지 않는다.
 *
 * 시각·DB·난수를 읽지 않는 순수 함수다. 같은 입력은 같은 결과다.
 */
import { FEED_RECENT_BG_LIMIT } from '@/lib/admin/feedCardServer'
import { assignFeedColors } from './feedAssign'
import { boxHasTextFor } from './feedConstants'
import { imageColorsForCard } from './feedImageColors'

/** 재배정 재료 한 장(`scripts/data/feed-color-reassign-input-20261123.json`의 `cards[]`). 시각은 에포크 초다. */
export interface FeedColorReassignCard {
  id: string
  feedType: string
  /** `feed_seed` */
  seed: number
  createdAt: number
  startsAt: number
  endsAt: number
  /** 첫 배지의 대표 색(`badges.bg_colors`). 배지 소개만 값이 있다. */
  badgeColors: unknown
}

export interface FeedColorReassignResult {
  id: string
  bg: string
  chip: string
  box: string
  /** 통과하는 조합이 없어 안전 조합으로 되돌렸으면 true */
  usedFallback: boolean
}

/** 처리 순서: 등록 시각 → 노출 시작 → id. 입력 배열은 바꾸지 않는다. */
export function sortForReassign<T extends Pick<FeedColorReassignCard, 'id' | 'createdAt' | 'startsAt'>>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.startsAt !== b.startsAt) return a.startsAt - b.startsAt
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** 카드 한 장의 이미지 규칙 입력. 서버(`fetchFeedCardImageColors`)가 `imageColorsForCard`에 넘기는 모양과 같다. */
function imageInputOf(card: FeedColorReassignCard) {
  const isBadgeType = card.feedType === 'badge_intro' || card.feedType === 'badge_only' || card.feedType === 'drop_pickup'
  return imageColorsForCard({
    feedType: card.feedType,
    boxKind: null,
    coverColors: null,
    badgeColors: isBadgeType && card.badgeColors != null ? [card.badgeColors] : [],
    collectionBadgeColors: [],
  })
}

/** 카드 전체를 새 규칙으로 다시 배정한다. 결과는 처리 순서(등록 시각 → 노출 시작 → id)대로다. */
export function reassignFeedColors(cards: readonly FeedColorReassignCard[]): FeedColorReassignResult[] {
  const results: FeedColorReassignResult[] = []
  const done: Array<{ startsAt: number; endsAt: number; bg: string }> = []

  for (const card of sortForReassign(cards)) {
    const recentBgKeys = done
      .filter((prev) => prev.startsAt <= card.endsAt && prev.endsAt >= card.startsAt)
      .map((prev) => prev.bg)
      .slice(-FEED_RECENT_BG_LIMIT)
    const image = imageInputOf(card)
    const assigned = assignFeedColors({
      seed: card.seed,
      recentBgKeys,
      boxHasText: boxHasTextFor(card.feedType, null),
      imageHexes: image.imageHexes,
      chipOnImage: image.chipOnImage,
    })
    results.push({ id: card.id, bg: assigned.bg, chip: assigned.chip, box: assigned.box, usedFallback: assigned.usedFallback })
    done.push({ startsAt: card.startsAt, endsAt: card.endsAt, bg: assigned.bg })
  }
  return results
}
