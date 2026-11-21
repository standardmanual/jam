/**
 * 카드 유형 → 자동 색 배정에 넘길 이미지 대표 색 선택 (티켓 20261121_1828, 상위 20261120_2026 7회차-6).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「색」의 «이미지 대표 색 규칙(⑤ 그림과 배경 · ⑥ 그림과 칩)» 적용 대상 표다.
 * 이미지가 색 면 위에 놓이거나 색 면을 채우는 유형만 대표 색을 돌려주고, 나머지는 빈 목록이다(= 이미지 규칙을 쓰지 않는다).
 *
 * - 커버 이미지: 히어로(`hero_box`)·텍스트 박스의 이미지 마스크(`text_box` + `box_kind = image_mask`)·컬렉션 소개(`collection_intro`) → 카드의 커버 대표 색.
 *   이 셋은 칩이 이미지 위에 걸치므로 `chipOnImage`도 참이다(규칙 ⑥).
 * - 배지 그림이 배경 위에 놓이는 유형: 배지 소개(`badge_intro`)·배지만(`badge_only`) → 카드가 가리키는 첫 배지의 대표 색,
 *   드랍·픽업(`drop_pickup`) → 아이템 배지(최대 3개)의 대표 색 전부. 칩은 이미지 위에 걸치지 않는다.
 * - 그 밖(글자만 있는 텍스트 박스, 목록형, 전체 배경 이미지)은 적용하지 않는다.
 *
 * 대표 색이 `NULL`(아직 안 뽑음)이거나 `[]`(색 없음)이면 빈 목록이다. 읽을 수 없는 hex는 걸러 낸다.
 * 서버 모듈·DB·사전·난수·시각을 읽지 않는 순수 함수다(번들 경계: 운영 묶음 핸들러가 이 파일을 값으로 가져온다).
 */
import { FEED_DROP_PICKUP } from './feedConstants'
import { isHexColor } from './feedColorRules'

/** `assignFeedColors`의 `imageHexes`·`chipOnImage` 입력과 같은 모양. */
export interface FeedImageColorInput {
  imageHexes: string[]
  chipOnImage: boolean
}

export interface ImageColorsForCardInput {
  /** 카드 유형(`feed_type`). 비었거나 모르는 값이면 적용하지 않는다(옛 모양 카드). */
  feedType: string | null | undefined
  /** 박스 용도(`box_kind`). `text_box`에서만 본다. */
  boxKind: string | null | undefined
  /** 카드의 저장된 커버 대표 색(`today_cards.cover_colors`). 모양을 믿지 않는다(DB의 JSON 값이 그대로 올 수 있다). */
  coverColors: unknown
  /**
   * 카드가 가리키는 배지들의 저장된 대표 색(`badges.bg_colors`), `badge_ids` 순서 그대로, 삭제된 배지는 뺀 목록.
   * 홈이 «첫 배지»를 고르는 방식(삭제된 배지를 건너뛴다)과 같아야 해서 호출하는 쪽이 이 순서로 만든다.
   */
  badgeColors: readonly unknown[] | null | undefined
}

const NONE: FeedImageColorInput = { imageHexes: [], chipOnImage: false }

/** 저장된 JSON 값 → 읽을 수 있는 hex 목록. 배열이 아니면 빈 목록이다. */
function validHexes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isHexColor).map((hex) => hex.trim())
}

/** 이 유형이 대표 색 규칙을 받는지 정하고, 받으면 어느 이미지의 색을 쓰는지 고른다. */
export function imageColorsForCard(input: ImageColorsForCardInput): FeedImageColorInput {
  const badges = input.badgeColors ?? []
  let hexes: string[]
  let chipOnImage = false
  switch (input.feedType) {
    case 'hero_box':
    case 'collection_intro':
      hexes = validHexes(input.coverColors)
      chipOnImage = true
      break
    case 'text_box':
      if (input.boxKind !== 'image_mask') return NONE
      hexes = validHexes(input.coverColors)
      chipOnImage = true
      break
    case 'badge_intro':
    case 'badge_only':
      hexes = badges.length > 0 ? validHexes(badges[0]) : []
      break
    case 'drop_pickup':
      hexes = badges.slice(0, FEED_DROP_PICKUP.columns).flatMap(validHexes)
      break
    default:
      return NONE
  }
  if (hexes.length === 0) return NONE
  return { imageHexes: hexes, chipOnImage }
}
