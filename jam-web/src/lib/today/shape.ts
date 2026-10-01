/**
 * 홈피드 카드 모양(`shape`) 상수와 술어 (티켓 20260930_1453 확정 설계 1, 이 파일은 20261001_1152가 만들었다).
 *
 * 서버 모듈을 불러오지 않는 순수 파일이다 — 서버 코드(`opsInbox/validate.ts`)와 화면이 함께 읽는다.
 * `CARD_SHAPES`는 마이그레이션 206의 `today_cards_shape_check`와 같은 목록이므로 둘을 함께 바꾼다.
 * 옛 카드 값(`large_thumbnail` 등 layout)을 새 모양으로 바꾸는 대응(티켓 20261001_1155)과 판정 함수 `resolveShape`
 * (티켓 20260930_1453 조각 b1)는 각 티켓이 이 파일에 더한다. 이 파일에는 상수와 술어만 둔다.
 */

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
