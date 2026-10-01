/**
 * 홈피드 카드 모양(`shape`) 상수와 술어 (티켓 20260930_1453 확정 설계 1, 이 파일은 20261001_1152가 만들었다).
 *
 * 서버 모듈을 불러오지 않는 순수 파일이다 — 서버 코드(`opsInbox/validate.ts`)와 화면이 함께 읽는다.
 * `CARD_SHAPES`는 마이그레이션 206의 `today_cards_shape_check`와 같은 목록이므로 둘을 함께 바꾼다.
 * 옛 카드 값(`large_thumbnail` 등 layout)을 새 모양으로 바꾸는 판정 `resolveShape`와 그려질 모양 판정 `drawnShape`,
 * 이미지에 제목 있음 판정 `resolveTitleInImage`는 티켓 20261001_1357(1453 조각 b1)이 아래에 더했다.
 * 신호 엔진(티켓 20261001_1155)은 옛→새 대응을 새로 만들지 않고 `resolveShape`를 가져다 쓴다.
 */
import type { TodayCardRow } from '@/types/database'

/** 카드 모양 5개. 이미지가 있는 모양 3개(`hero`·`poster`·`square`)와 없는 모양 2개(`brief`·`list`). */
export const CARD_SHAPES = ['hero', 'poster', 'square', 'brief', 'list'] as const

export type CardShape = (typeof CARD_SHAPES)[number]

/** 이미지가 있는 모양 — 이미지 제작이 필요한 모양이다. */
export const IMAGE_CARD_SHAPES = ['hero', 'poster', 'square'] as const satisfies readonly CardShape[]

export type ImageCardShape = (typeof IMAGE_CARD_SHAPES)[number]

/** 모양 값인지. 대소문자와 앞뒤 공백까지 정확히 같아야 한다(옛 layout 값 `large_thumbnail` 등은 모양이 아니다). */
export function isCardShape(value: unknown): value is CardShape {
  return typeof value === 'string' && (CARD_SHAPES as readonly string[]).includes(value)
}

/** 이미지가 있는 모양인지(`hero`·`poster`·`square`). */
export function isImageShape(value: unknown): value is ImageCardShape {
  return typeof value === 'string' && (IMAGE_CARD_SHAPES as readonly string[]).includes(value)
}

// ─── 옛 값 → 새 모양 판정 (티켓 20261001_1357, 1453 확정 설계 6절) ───────────────────────────

/**
 * 옛 카드를 새 모양으로 그리는 전환 스위치(1453 결정 17). 조각 b7에서 `true`로 바꾼다.
 * 꺼져 있으면 `shape`가 저장된 카드와 운영툴 미리보기만 새 모양으로 그리고, 옛 카드는 옛 렌더러로 그린다.
 */
export const LEGACY_SHAPE_CUTOVER = false

/** 모양 판정이 읽는 카드 값. 카드 행(`TodayCardRow`)과 서버 조회 결과(`TodayCardWithHref`)가 모두 맞는다. */
export interface ShapeCardInput {
  /** 저장된 모양. 모양 값이면 그대로 쓴다(NULL·없음 = 옛 카드). */
  shape?: string | null
  template_type: TodayCardRow['template_type']
  layout_type: TodayCardRow['layout_type']
  cover_image_url: string | null
  /** 서버가 조회한 배지 정보. 있으면 「첫 배지 그림이 커버로 올라갔는지」를 이것으로 판정한다. */
  resolved_badges?: readonly { image_url: string | null }[] | null
  /** `resolved_badges`가 없을 때(카드 행만 가진 호출부)의 대신 근거. 배지가 하나라도 걸려 있으면 승격된 것으로 본다. */
  badge_ids?: readonly string[] | null
}

/**
 * 커버가 없어 첫 배지 그림이 커버로 올라가던 카드인지 — `TodayCardStack.resolveCover`의 지금 규칙과 같다
 * (`cover_image_url`이 비어 있고 첫 번째 배지에 그림이 있을 때).
 */
function isCoverPromotedFromBadge(card: ShapeCardInput): boolean {
  if (card.cover_image_url) return false
  if (card.resolved_badges) return Boolean(card.resolved_badges[0]?.image_url)
  return (card.badge_ids?.length ?? 0) > 0
}

/**
 * 카드 하나의 모양을 정한다(대응표 정본은 티켓 20260930_1453 확정 설계 6절).
 * 순서: ① 저장된 `shape`가 모양 값이면 그대로 → ② 기사(`editorial_article`)는 레이아웃과 상관없이 `hero`
 * → ③ 옛 `layout_type`으로 정한다. 알 수 없는 layout 값은 지금 렌더러처럼 큰 썸네일형으로 본다.
 *
 * `list`의 타일형·행형 구분과 「타일 0개면 `brief`」는 표시 데이터(`toCardView`)가 정한다.
 */
export function resolveShape(card: ShapeCardInput): CardShape {
  if (isCardShape(card.shape)) return card.shape
  if (card.template_type === 'editorial_article') return 'hero'

  switch (card.layout_type) {
    case 'banner':
      return card.cover_image_url ? 'poster' : 'brief'
    case 'badge_gallery':
    case 'ranking_list':
      return 'list'
    case 'shortcut':
    case 'other':
      return 'brief'
    case 'large_thumbnail':
    default:
      if (card.template_type === 'mission_spotlight') return 'square'
      return isCoverPromotedFromBadge(card) ? 'square' : 'hero'
  }
}

/**
 * 지금 화면에 그려질 모양. `shape`가 저장돼 있으면 그 값, 없으면 전환 상수가 켜졌을 때만 `resolveShape`,
 * 꺼져 있으면 `null`(옛 렌더러로 그린다는 뜻). `legacyCutover`는 시험에서 켜진 상태를 확인할 때 넘긴다.
 */
export function drawnShape(card: ShapeCardInput, legacyCutover: boolean = LEGACY_SHAPE_CUTOVER): CardShape | null {
  if (isCardShape(card.shape)) return card.shape
  return legacyCutover ? resolveShape(card) : null
}

/**
 * 이미지가 제목을 말하는 카드인지(1453 결정 6·12). 저장된 `title_in_image`가 `true`/`false`면 그 값이다.
 * `NULL`(옛 카드)이면 미션 소개 카드이고 커버 주소가 연결 미션의 `image_url`과 같을 때만 `true`, 그 밖은 `false`.
 */
export function resolveTitleInImage(
  card: Pick<TodayCardRow, 'template_type' | 'cover_image_url'> & { title_in_image?: boolean | null },
  missionImageUrl?: string | null,
): boolean {
  if (typeof card.title_in_image === 'boolean') return card.title_in_image
  if (card.template_type !== 'mission_spotlight') return false
  return Boolean(card.cover_image_url) && card.cover_image_url === missionImageUrl
}
