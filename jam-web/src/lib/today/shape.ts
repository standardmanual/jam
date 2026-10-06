/**
 * 홈피드 카드 모양(`shape`) 상수와 술어 (티켓 20260930_1453 확정 설계 1, 이 파일은 20261001_1152가 만들었다).
 *
 * 서버 모듈을 불러오지 않는 순수 파일이다 — 서버 코드(`opsInbox/validate.ts`)와 화면이 함께 읽는다.
 * `CARD_SHAPES`는 마이그레이션 206의 `today_cards_shape_check`와 같은 목록이므로 둘을 함께 바꾼다.
 * 옛 카드 값(`large_thumbnail` 등 layout)을 새 모양으로 바꾸는 판정 `resolveShape`와 그려질 모양 판정 `drawnShape`,
 * 이미지에 제목 있음 판정 `resolveTitleInImage`는 티켓 20261001_1357(1453 조각 b1)이 아래에 더했다.
 * 신호 엔진(티켓 20261001_1155)은 옛→새 대응을 새로 만들지 않고 `resolveShape`를 가져다 쓴다.
 *
 * 계측(`events.ts`)이 화면 모듈(`cardView.ts`, 한국어 사전을 가져온다)을 값으로 가져오지 않도록, 두 쪽이 함께 쓰는 순수 판정
 * (자원 대응 `resourceOfTemplate`·`CARD_RESOURCES`, 타일 0개 `list`의 `brief` 대체 `fallbackEmptyTileShape`, 랭킹 행형 판정
 * `isRankingRows`)은 이 파일에 둔다(티켓 20261001_2244). `cardView.ts`가 같은 이름으로 다시 내보낸다. 이 파일은 사전·서버 모듈을
 * 값으로 가져오지 않는다 — 그래야 이벤트 API 번들에 사전이 실리지 않는다(`__tests__/eventsImports.test.ts`가 import 그래프로 고정한다).
 */
import type { TodayCardRow, TodayCardTemplateType } from '@/types/database'

/** 카드 모양 5개. 이미지가 있는 모양 3개(`hero`·`poster`·`square`)와 없는 모양 2개(`brief`·`list`). */
export const CARD_SHAPES = ['hero', 'poster', 'square', 'brief', 'list'] as const

export type CardShape = (typeof CARD_SHAPES)[number]

/**
 * 모양별 카드 제목 글자 수 상한(홈피드 PRD §6 「글자 배치 상한」 표, 1453 확정 설계 3절). 글자 수는 운영자가 문구를 쓸 때 지킬 설계 상한이라
 * 어겨도 막지 않고 경고한다(티켓 20261002_1028). `CARD_SHAPES`와 같은 키를 가진다.
 */
export const CARD_TITLE_MAX_LENGTH: Record<CardShape, number> = {
  hero: 22,
  poster: 18,
  square: 22,
  brief: 28,
  list: 22,
}

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
 * 옛 카드를 새 모양으로 그리는 전환 스위치(1453 결정 17). 조각 b7(티켓 20261001_2244)에서 `true`로 바꿨다.
 * `shape`가 없는 옛 카드도 `resolveShape` 대응표대로 새 모양으로 그린다고 보고 `drawnShape`가 그 모양을 돌려준다(계측이 기록하는 모양).
 * 옛 렌더러는 지웠으므로 홈 화면(`TodayCardStack`)은 이 상수와 무관하게 늘 `resolveShape`(`toCardView`)로 그린다 — `false`로 끄면 옛 카드의 기록 모양만
 * NULL이 되어 화면과 어긋난다. 화면을 되돌리는 수단이 아니라 기록 쪽 분기이고, 화면 되돌림은 이 조각의 머지를 되돌린다.
 */
export const LEGACY_SHAPE_CUTOVER = true

/** 모양 판정이 읽는 카드 값. 카드 행(`TodayCardRow`)과 서버 조회 결과(`TodayCardWithHref`)가 모두 맞는다. */
export interface ShapeCardInput {
  /** 저장된 모양. 모양 값이면 그대로 쓴다(NULL·없음 = 옛 카드). */
  shape?: string | null
  template_type: TodayCardRow['template_type']
  layout_type: TodayCardRow['layout_type']
  cover_image_url: string | null
  /**
   * 카드 행에 걸린 배지 ID. 커버가 없는 옛 큰 카드가 `square`인지는 이 값의 유무만으로 정한다 — 화면(`toCardView`)·계측(`events.ts`)·
   * 신호 엔진(`opsSignals/load.ts`)이 같은 카드 행을 같은 입력으로 판정해야 기록 모양과 화면 모양이 갈리지 않는다(티켓 20261001_2244).
   * 서버가 조회한 배지 정보(`resolved_badges`, 삭제된 배지는 빠진다)는 읽지 않는다.
   */
  badge_ids?: readonly string[] | null
}

/**
 * 커버가 없어 배지가 걸려 있는 옛 카드인지 — 옛 렌더러는 이런 카드의 첫 배지 그림을 커버로 올려 그렸다(`cover_image_url`이 비어 있을 때).
 * 배지가 걸려 있기만 하면 그림이 없어도(그림 없는 배지, 삭제된 배지) 승격된 것으로 본다: 모양은 `square`가 되고 이미지 칸은 자리 표시를 그린다
 * (1453 결정 13, 사용자 확인 2026-10-01). 그림이 있으면 그 그림을, 없으면 자리 표시를 `toCardView`가 정한다.
 */
function isCoverPromotedFromBadge(card: ShapeCardInput): boolean {
  if (card.cover_image_url) return false
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
 * 꺼져 있으면 `null`(계측은 `card_shape`를 NULL로 기록한다). `legacyCutover`는 시험에서 값을 바꿔 확인할 때 넘긴다.
 */
export function drawnShape(card: ShapeCardInput, legacyCutover: boolean = LEGACY_SHAPE_CUTOVER): CardShape | null {
  if (isCardShape(card.shape)) return card.shape
  return legacyCutover ? resolveShape(card) : null
}

// ─── 화면·계측이 함께 쓰는 순수 판정 (티켓 20261001_2244) ───────────────────────────────────

/** 카드가 소개하는 자원. `recipe`는 레시피 공개 카드(`recipe_reveal`)가 소개한다(티켓 20261006_1217). */
export const CARD_RESOURCES = ['mission', 'drop', 'recipe', 'badge', 'article', 'ranking', 'collection', 'auto'] as const

export type CardResource = (typeof CARD_RESOURCES)[number]

/** 템플릿 → 자원 대응(확정 설계 2절). `location_trend`는 표에 없어 자동 카드와 같은 짧은 소식으로 본다. */
const RESOURCE_BY_TEMPLATE: Record<TodayCardTemplateType, CardResource> = {
  mission_spotlight: 'mission',
  drop_alert: 'drop',
  badge_spotlight: 'badge',
  editorial_article: 'article',
  ranking_board: 'ranking',
  itembook_milestone: 'collection',
  progress_nudge: 'auto',
  location_trend: 'auto',
  recipe_reveal: 'recipe',
}

/**
 * 템플릿 → 자원. 타입은 닫힌 유니온이지만 DB의 템플릿 값은 런타임에 열려 있다 — 이 코드가 모르는 값이 먼저 들어오면 `undefined`가 돌아온다
 * (티켓 20261006_1217 안전망). 그 카드는 자원 줄(필수 정보)·자원 아이콘 없이 그려지고 홈은 오류 화면이 되지 않는다. 이 값을 읽는 쪽은 `undefined`를 견뎌야 한다
 * (`resourceIconOf`는 아이콘을 그리지 않고, 그 밖의 읽기는 자원끼리 비교만 하므로 어느 자원도 아니다).
 */
export function resourceOfTemplate(templateType: TodayCardTemplateType): CardResource {
  return RESOURCE_BY_TEMPLATE[templateType]
}

/**
 * 「랭킹이면 행형」 판정 — `list` 모양의 두 갈래(타일형·행형)를 가르는 단 하나의 규칙이다. `TodayCard`(카드 전체 링크를 걸지 말지)·`ListCard`(어느 갈래를 그릴지)·
 * `toCardView`(타일을 싣을지 순위를 싣을지)·`fallbackEmptyTileShape`가 모두 이 함수를 쓴다. 한쪽만 바뀌면 행형 카드에 카드 전체 링크가 걸려
 * 앵커가 겹치거나(순위 행은 각자 프로필 링크다) 타일형 카드가 링크 없이 그려진다(티켓 20261001_2244).
 */
export function isRankingRows(resource: CardResource): boolean {
  return resource === 'ranking'
}

/**
 * 타일이 0개인 타일형 `list`는 `brief`로 그린다(확정 설계 1절). 랭킹 행형(`isRankingRows`)은 타일이 아니라 순위 행이라 해당하지 않는다.
 * `toCardView`와 계측(`events.ts`의 기록 시점 모양)이 같은 규칙을 쓰려고 한 함수로 둔다(티켓 20261001_1431).
 */
export function fallbackEmptyTileShape(shape: CardShape, resource: CardResource, tileCount: number): CardShape {
  return shape === 'list' && !isRankingRows(resource) && tileCount === 0 ? 'brief' : shape
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
