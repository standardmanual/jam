/**
 * 칩 자리 표 — 카드 유형마다 칩을 놓을 수 있는 자리와 개수 한도 (티켓 20261121_0012, 상위 20261120_2026 4회차-1).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」의 «카드 유형 8가지» 표(칩 자리 묶음)와 «칩 → 자리와 기울기»다.
 * 이 파일은 자리 이름과 «어느 유형이 어느 자리를 쓰는가»만 정한다. 자리가 화면에서 어디에 놓이는지(오프셋·한도)는 화면 회차(4-2~)가 정한다.
 *
 * - 유형 키 8개는 `today_cards.feed_type`의 허용 값과 같다(마이그레이션 349 `today_cards_feed_type_check`).
 * - 자리 이름은 DB 규칙(`^[a-z][a-z0-9-]{0,23}$`, 소문자로 시작·소문자·숫자·하이픈 24자 이내)을 따른다.
 * - 칩이 2개면 서로 **대각선** 자리에 둔다. 대각선 짝이 없는 자리는 칩 1개일 때만 쓴다.
 * - 자리가 하나뿐인 유형(목록형의 오른쪽 위)은 칩을 1개만 둔다. «배지만»은 칩이 없다. 드랍·픽업은 칩 «드랍»·«픽업» 두 개를 박스 줄의 대각선 모서리에 둔다(티켓 20261121_0115 재작업, 샘플 기준).
 */

export const FEED_TYPES = [
  'hero_box',
  'full_image',
  'badge_intro',
  'badge_only',
  'collection_intro',
  'drop_pickup',
  'text_box',
  'gallery_list',
] as const

export type FeedType = (typeof FEED_TYPES)[number]

/** 카드당 칩 최대 개수(제목 속 칩은 따로 최대 2개, PRD «개수»). */
export const MAX_CARD_CHIPS = 2

/** DB가 받는 자리 이름 형식(`today_cards.chips[].slot`, `stamp_slot`과 같은 규칙). */
export const FEED_SLOT_PATTERN = /^[a-z][a-z0-9-]{0,23}$/

export interface FeedChipSlotSpec {
  /** 이 유형이 허용하는 자리 전부. 칩이 1개일 때는 이 중 하나를 쓴다. */
  readonly slots: readonly string[]
  /** 서로 대각선인 자리 짝. 칩이 2개일 때는 이 중 한 짝을 쓴다. 비어 있으면 칩은 1개까지다. */
  readonly diagonalPairs: ReadonlyArray<readonly [string, string]>
}

const imageCorners = (prefix: string) =>
  [`${prefix}-top-left`, `${prefix}-top-right`, `${prefix}-bottom-left`, `${prefix}-bottom-right`] as const

/** 네 모서리를 쓰는 유형의 명세 — 위왼쪽↔아래오른쪽, 위오른쪽↔아래왼쪽이 대각선이다. */
function cornerSpec(prefix: string): FeedChipSlotSpec {
  const [tl, tr, bl, br] = imageCorners(prefix)
  return {
    slots: [tl, tr, bl, br],
    diagonalPairs: [
      [tl, br],
      [tr, bl],
    ],
  }
}

/**
 * 유형별 칩 자리 명세. 자리 묶음은 PRD 카드 유형 표의 «칩 자리 묶음» 열이다.
 *
 * - 히어로: 이미지 모서리에 걸침 → `image-*` 네 모서리
 * - 전체 배경 이미지: 이미지 위 모서리. 제목이 왼쪽 아래에 얹히므로 그 자리(`image-bottom-left`)는 쓰지 않는다 → 세 자리, 대각선 짝은 하나
 * - 배지 소개: 배지 둘레 → `badge-*` 네 모서리
 * - 배지만: 칩 없음
 * - 컬렉션 소개: 그림 모서리 → `art-*` 네 모서리
 * - 드랍·픽업: 박스 줄의 네 모서리(`box-row-*`) → 칩 2개(대각선 짝)
 * - 텍스트: 박스 모서리에 걸침 → `box-*` 네 모서리
 * - 목록형: 카드 오른쪽 위 하나(`card-top-right`)
 */
export const FEED_CHIP_SLOT_SPECS: Readonly<Record<FeedType, FeedChipSlotSpec>> = {
  hero_box: cornerSpec('image'),
  full_image: {
    slots: ['image-top-left', 'image-top-right', 'image-bottom-right'],
    diagonalPairs: [['image-top-left', 'image-bottom-right']],
  },
  badge_intro: cornerSpec('badge'),
  badge_only: { slots: [], diagonalPairs: [] },
  collection_intro: cornerSpec('art'),
  drop_pickup: cornerSpec('box-row'),
  text_box: cornerSpec('box'),
  gallery_list: { slots: ['card-top-right'], diagonalPairs: [] },
}

/** 유형이 가질 수 있는 칩 개수 상한. 자리가 없으면 0, 대각선 짝이 없으면 1, 있으면 `MAX_CARD_CHIPS`. */
export function chipLimitOf(feedType: FeedType): number {
  const spec = FEED_CHIP_SLOT_SPECS[feedType]
  if (spec.slots.length === 0) return 0
  return spec.diagonalPairs.length > 0 ? MAX_CARD_CHIPS : 1
}

/** 이 자리의 대각선 맞은편. 짝이 없으면(칩 1개 전용 자리) null. 유형마다 짝이 정해져 있어 유형을 함께 받는다. */
export function diagonalOf(feedType: FeedType, slot: string): string | null {
  for (const [a, b] of FEED_CHIP_SLOT_SPECS[feedType].diagonalPairs) {
    if (a === slot) return b
    if (b === slot) return a
  }
  return null
}

/** 이 유형이 허용하는 자리인가. */
export function isAllowedSlot(feedType: FeedType, slot: string): boolean {
  return FEED_CHIP_SLOT_SPECS[feedType].slots.includes(slot)
}

export function isFeedType(value: unknown): value is FeedType {
  return typeof value === 'string' && (FEED_TYPES as readonly string[]).includes(value)
}
