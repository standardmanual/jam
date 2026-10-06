/**
 * 홈피드 카드 묶음의 순수 검사와 insert 페이로드(티켓 20261002_1027, 상위 20260930_1500 ②-2a).
 *
 * `scripts/asset-generator/registerHomeFeedBundle.mjs`가 갖고 있던 카드 쪽 상수·`validateCard`·
 * `buildTodayCardInsertPayload`를 서버(운영툴 예약 등록)도 같은 함수로 쓰게 옮긴 모듈이다. 동작·오류 문장·
 * 페이로드 키 집합은 옮기기 전과 같다. 스크립트는 같은 이름의 상수를 다시 내보내고, `validateCard`는 이 함수를 부르며,
 * `buildTodayCardInsertPayload`는 얇은 JS 래퍼로 이 함수를 부른다. 이 폴더의 파일은 `node:` 모듈과 `scripts/` 아래
 * 파일을 가져오지 않는다(`__tests__/registerChecks.test.ts`가 원문으로 확인한다).
 *
 * 묶음 형식의 정본은 `docs/specs/prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md`다.
 *
 * ## 검증 규칙의 원천 (티켓 20260925_1413 결정 기록 3)
 * 어드민 `today_cards` 생성 API(`api/admin/today/route.ts` POST)는 본문을 검증 없이 insert하므로 «재사용할 검증 함수»가
 * 없다. 규칙은 어드민 폼(`TodayCardForm.tsx`의 `collectMissing`: 제목·노출 조건 태그 1개 이상·시작·종료 일시)과
 * `lib/admin/today-sections.ts`의 상수, DB CHECK 제약(마이그레이션 048·049·158·183·190)에 있다. 폼은 UI 컴포넌트라
 * 가져올 수 없어 같은 규칙을 순수 함수로 다시 적되, **허용값 목록은 `today-sections.ts` 상수에서 뽑는다**
 * (목록이 갈라지지 않게 — `registerHomeFeedBundle.test.ts`가 DB CHECK 마이그레이션과도 대조한다).
 *
 * 상수에 `as const`를 쓰지 않는다 — 스크립트 테스트가 상수에 타입 단언을 해서 읽기 전용 튜플이면 컴파일이 깨진다.
 */
import type { TodayCardLayoutType, TodayCardTemplateType } from '@/types/database'
import {
  SUGGESTED_LAYOUT_FOR,
  TODAY_CONTENT_TYPE_OPTIONS,
  TODAY_DESCRIPTION_MAX_LENGTH,
  TODAY_EXPOSURE_TAG_OPTIONS,
  TODAY_FIELDS_FOR,
  TODAY_LAYOUT_OPTIONS,
  TODAY_TEMPLATE_OPTIONS,
} from '@/lib/admin/today-sections'
import type { TodayTemplateFields } from '@/lib/admin/today-sections'
import {
  AGENT_IMAGE_SOURCE,
  UUID_PATTERN,
  checkRequired,
  describeValue,
  hasControlOrLineBreak,
  isIsoDateTime,
  isNonEmptyString,
  isPlainObject,
  isPresent,
  unknownKeys,
  visibleLength,
} from './bundleRules'
import type { PlainObject } from './bundleRules'

export const CARD_REQUIRED_FIELDS = ['title', 'template_type', 'starts_at', 'ends_at', 'exposure_tags']
export const CARD_OPTIONAL_FIELDS = [
  'layout_type',
  'subtitle',
  'description',
  'badge_ids',
  'mission_id',
  'item_book_id',
  'region_label',
  'body_markdown',
  'ranking_mode_id',
  'recipe_id',
  'content_type_id',
  'target_href',
  'sort_order',
  'is_active',
]

/** 허용값 목록 — 전부 `today-sections.ts` 상수에서 뽑는다(직접 적지 않는다). */
export const TEMPLATE_TYPES = TODAY_TEMPLATE_OPTIONS.map((o) => o.value)
export const LAYOUT_TYPES = TODAY_LAYOUT_OPTIONS.map((o) => o.value)
export const EXPOSURE_TAGS = TODAY_EXPOSURE_TAG_OPTIONS.map((o) => o.value)
export const CONTENT_TYPE_IDS = TODAY_CONTENT_TYPE_OPTIONS.map((o) => o.value)

/**
 * 묶음 필드 → 템플릿이 그 필드를 쓰는지(`TODAY_FIELDS_FOR`의 키). 폼은 템플릿이 쓰지 않는 필드를 저장할 때 조용히
 * 비운다(`buildTodayCardSavePayload`). 묶음은 그렇게 조용히 사라지는 값을 거절해 «적은 대로 등록된다»를 지킨다.
 * `content_type_id`는 템플릿과 무관하게 모든 카드에 붙일 수 있어 여기 없다.
 */
export const TEMPLATE_FIELD_KEY = {
  badge_ids: 'badges',
  mission_id: 'mission',
  item_book_id: 'itemBook',
  region_label: 'region',
  body_markdown: 'body',
  description: 'description',
  ranking_mode_id: 'rankingMode',
  recipe_id: 'recipe',
  target_href: 'targetHref',
} satisfies Record<string, keyof TodayTemplateFields>

/**
 * 템플릿마다 «이 값이 없으면 카드가 의미가 없는» 참조 필드(목록 중 하나 이상). 어드민 폼은 이 값을 강제하지 않는다 —
 * 자동 경로(사람이 화면을 보며 채우지 않는 경로)라서 빈 카드가 실수로 등록되지 않게 이 스크립트가 더한 규칙이다.
 * 각 필드는 그 템플릿의 `TODAY_FIELDS_FOR`가 허용하는 것이어야 한다(테스트로 고정).
 */
export const REQUIRED_REFERENCE_FIELDS: Record<TodayCardTemplateType, string[]> = {
  badge_spotlight: ['badge_ids'],
  progress_nudge: ['badge_ids', 'mission_id'],
  mission_spotlight: ['mission_id'],
  itembook_milestone: ['item_book_id'],
  location_trend: ['region_label'],
  drop_alert: [],
  editorial_article: ['body_markdown'],
  ranking_board: ['ranking_mode_id'],
  // 필수 참조 없음 — 레시피 칸(`recipe_id`)이 비어 있어도 카드가 그려진다(레시피 줄 없이, 티켓 20261006_1218).
  recipe_reveal: [],
}

// 본문(body_markdown)만 줄바꿈·탭을 허용한다. SQL 값은 문자열 리터럴로만 들어가고 주석에는 쓰지 않는다.
// 한 줄 텍스트의 개행·제어 문자 정규식 원본은 `bundleRules.ts`의 `CONTROL_OR_LINE_BREAK` 한 곳이다.
export const BODY_FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

/** 한 줄 문자열 필드 검사(비어 있지 않고 줄바꿈·제어 문자가 없어야 한다). 값이 없으면 아무것도 하지 않는다. */
export function checkOneLine(errors: string[], label: string, value: unknown): void {
  if (!isPresent(value)) return
  if (!isNonEmptyString(value)) errors.push(`${label}: 비어 있지 않은 문자열이어야 해요.`)
  else if (hasControlOrLineBreak(value)) errors.push(`${label}: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`)
}

/** 값이 «채워졌는가» — 빈 배열·빈 문자열은 채우지 않은 것으로 본다(폼도 이 값들을 null·[]로 저장한다). */
export function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return isPresent(value)
}

export function checkUuidField(errors: string[], key: string, value: unknown): void {
  if (isPresent(value) && !(typeof value === 'string' && UUID_PATTERN.test(value))) {
    errors.push(`card.${key}: UUID 형식이어야 해요(받은 값: ${describeValue(value)}).`)
  }
}

/**
 * 카드 한 건을 검사해 오류 문장을 `errors`에 쌓는다(첫 오류에서 멈추지 않는다). 카드가 객체가 아니면 한 줄만 쌓고 끝낸다.
 */
export function validateCard(errors: string[], input: unknown): void {
  const prefix = 'card.'
  if (!isPlainObject(input)) {
    errors.push('card: 객체여야 해요.')
    return
  }
  const card = input as PlainObject

  const supportedKeys = [...CARD_REQUIRED_FIELDS, ...CARD_OPTIONAL_FIELDS]
  const unknown = unknownKeys(card, supportedKeys)
  if (unknown.length > 0) {
    errors.push(`card: 묶음이 지원하지 않는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${supportedKeys.join(', ')}`)
  }
  checkRequired(errors, prefix, card, CARD_REQUIRED_FIELDS)

  // 허용값 포함 검사용 — 값이 어떤 타입이든 들어오므로 문자열 목록으로 넓혀서 쓴다.
  const templateTypes: readonly string[] = TEMPLATE_TYPES
  const layoutTypes: readonly string[] = LAYOUT_TYPES
  const exposureTags: readonly string[] = EXPOSURE_TAGS
  const contentTypeIds: readonly string[] = CONTENT_TYPE_IDS

  // 분류 — 템플릿·노출 형태는 어드민 폼 선택지와 같은 목록이다.
  let templateType: TodayCardTemplateType | null = null
  if (isPresent(card.template_type)) {
    if (typeof card.template_type !== 'string' || !templateTypes.includes(card.template_type)) {
      errors.push(`card.template_type: ${TEMPLATE_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(card.template_type)}).`)
    } else {
      templateType = card.template_type as TodayCardTemplateType
    }
  }
  const layoutTypeOk = !isPresent(card.layout_type) || (typeof card.layout_type === 'string' && layoutTypes.includes(card.layout_type))
  if (!layoutTypeOk) {
    errors.push(`card.layout_type: ${LAYOUT_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(card.layout_type)}).`)
  }

  // 미션 카드 규칙(2026-09-26 사용자 결정, content-automation/PRD.md §8) — mission_spotlight는 항상 large_thumbnail이다.
  if (templateType !== null && layoutTypeOk && templateType === 'mission_spotlight') {
    const finalLayout = card.layout_type ?? SUGGESTED_LAYOUT_FOR.mission_spotlight
    if (finalLayout !== 'large_thumbnail') {
      errors.push(
        `card.layout_type: mission_spotlight 템플릿은 항상 large_thumbnail이어야 해요(대표 이미지로 미션을 소개하는 카드 규칙, content-automation/PRD.md §8. 받은 값: ${describeValue(finalLayout)}).`
      )
    }
  }

  // 기본 정보
  checkOneLine(errors, 'card.title', card.title)
  checkOneLine(errors, 'card.subtitle', card.subtitle)
  // 게재용 설명문(티켓 20260929_1335) — 한 줄, 공백 포함 TODAY_DESCRIPTION_MAX_LENGTH자 이하(폼 maxLength와 같은 상수).
  // editorial_article이 쓰면 아래 템플릿 규칙(TEMPLATE_FIELD_KEY)이 거절한다.
  checkOneLine(errors, 'card.description', card.description)
  if (isNonEmptyString(card.description) && !hasControlOrLineBreak(card.description) && visibleLength(card.description.trim()) > TODAY_DESCRIPTION_MAX_LENGTH) {
    errors.push(`card.description: 공백 포함 ${TODAY_DESCRIPTION_MAX_LENGTH}자 이하여야 해요(받은 값: ${visibleLength(card.description.trim())}자).`)
  }
  checkOneLine(errors, 'card.region_label', card.region_label)

  // 노출 조건 태그 — 폼 collectMissing과 같이 1개 이상, 허용 목록 안의 값.
  if (isPresent(card.exposure_tags)) {
    const tags = card.exposure_tags
    if (!Array.isArray(tags) || tags.length === 0) {
      errors.push('card.exposure_tags: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).')
    } else {
      const invalid = tags.filter((tag) => typeof tag !== 'string' || !exposureTags.includes(tag))
      if (invalid.length > 0) {
        errors.push(`card.exposure_tags: 허용하지 않는 태그예요 — ${invalid.map(describeValue).join(', ')}. 허용 태그: ${EXPOSURE_TAGS.join(', ')}`)
      } else if (new Set(tags).size !== tags.length) {
        errors.push('card.exposure_tags: 같은 태그를 두 번 넣을 수 없어요.')
      }
    }
  }

  // 컨텐츠 유형 ID(T01~T17, 비움 허용) — DB CHECK(마이그레이션 183)와 같은 목록.
  if (isPresent(card.content_type_id) && !(typeof card.content_type_id === 'string' && contentTypeIds.includes(card.content_type_id))) {
    errors.push(`card.content_type_id: ${CONTENT_TYPE_IDS[0]}~${CONTENT_TYPE_IDS[CONTENT_TYPE_IDS.length - 1]} 중 하나여야 해요(받은 값: ${describeValue(card.content_type_id)}).`)
  }

  // 참조 필드 형식
  if (isPresent(card.badge_ids)) {
    const ids = card.badge_ids
    if (!Array.isArray(ids) || ids.some((id) => !(typeof id === 'string' && UUID_PATTERN.test(id)))) {
      errors.push('card.badge_ids: 배지 ID(UUID) 문자열의 배열이어야 해요.')
    } else if (new Set(ids.map((id: string) => id.toLowerCase())).size !== ids.length) {
      errors.push('card.badge_ids: 같은 배지를 두 번 넣을 수 없어요.')
    }
  }
  for (const key of ['mission_id', 'item_book_id', 'ranking_mode_id', 'recipe_id']) checkUuidField(errors, key, card[key])

  if (isPresent(card.body_markdown)) {
    if (!isNonEmptyString(card.body_markdown)) errors.push('card.body_markdown: 비어 있지 않은 문자열이어야 해요.')
    else if (BODY_FORBIDDEN_CONTROL.test(card.body_markdown)) {
      errors.push('card.body_markdown: 줄바꿈·탭 말고 다른 제어 문자는 쓸 수 없어요.')
    }
  }
  if (isPresent(card.target_href)) {
    const href = card.target_href
    const internal = typeof href === 'string' && /^\/(?!\/)\S*$/.test(href)
    const external = typeof href === 'string' && /^https:\/\/\S+$/.test(href)
    if (!internal && !external) {
      errors.push(`card.target_href: 앱 안 경로(/로 시작, 예: /missions/…)이거나 https 주소여야 해요(받은 값: ${describeValue(href)}).`)
    }
  }

  // 템플릿 규칙(`TODAY_FIELDS_FOR`) — 그 템플릿이 쓰지 않는 필드는 거절하고, 꼭 있어야 하는 참조는 요구한다.
  if (templateType !== null) {
    const fields = TODAY_FIELDS_FOR[templateType]
    for (const [key, fieldKey] of Object.entries(TEMPLATE_FIELD_KEY)) {
      if (isFilled(card[key]) && !fields[fieldKey]) {
        errors.push(`card.${key}: ${templateType} 템플릿은 이 필드를 쓰지 않아요(어드민 폼도 저장할 때 비워요). 묶음에서 빼 주세요.`)
      }
    }
    const required = REQUIRED_REFERENCE_FIELDS[templateType]
    if (required.length > 0 && !required.some((key) => isFilled(card[key]))) {
      errors.push(`card.${required.join(' 또는 card.')}: ${templateType} 템플릿은 이 참조가 있어야 카드가 의미가 있어요.`)
    }
  }

  // 기간 — 폼 collectMissing(시작·종료 필수)과 같이 둘 다 필요하고, 시작이 앞이어야 한다.
  for (const key of ['starts_at', 'ends_at']) {
    if (isPresent(card[key]) && !isIsoDateTime(card[key])) {
      errors.push(`card.${key}: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-10-01T00:00:00+09:00).`)
    }
  }
  if (isIsoDateTime(card.starts_at) && isIsoDateTime(card.ends_at) && Date.parse(card.starts_at) >= Date.parse(card.ends_at)) {
    errors.push('card.starts_at: ends_at보다 앞이어야 해요.')
  }

  // 정렬·상태
  if (isPresent(card.sort_order) && !Number.isSafeInteger(card.sort_order)) {
    errors.push(`card.sort_order: 정수여야 해요(받은 값: ${describeValue(card.sort_order)}).`)
  }
  if (isPresent(card.is_active) && typeof card.is_active !== 'boolean') {
    errors.push(`card.is_active: true 또는 false여야 해요(받은 값: ${describeValue(card.is_active)}).`)
  }
}

/** 페이로드가 읽는 카드 필드(검사를 통과한 묶음의 `card`). */
export interface HomeFeedCardInput {
  template_type: TodayCardTemplateType
  layout_type?: TodayCardLayoutType | null
  title: string
  subtitle?: string | null
  description?: string | null
  badge_ids?: string[] | null
  mission_id?: string | null
  item_book_id?: string | null
  region_label?: string | null
  body_markdown?: string | null
  ranking_mode_id?: string | null
  recipe_id?: string | null
  content_type_id?: string | null
  target_href?: string | null
  exposure_tags: string[]
  starts_at: string
  ends_at: string
  sort_order?: number | null
  is_active?: boolean | null
}

export interface HomeFeedPayloadOptions {
  /** 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID. */
  id: string
  /** 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함). 이미지 없이 예약하는 카드(운영툴, 티켓 20261002_1028)는 null이다. */
  coverImageUrl: string | null
  /** 생략하면 `agent-generator`. 값을 주면(null 포함) 그대로 넣는다. */
  imageSource?: string | null
  /** 생략하면 null(옛 렌더러로 그리는 기존 카드와 같은 값). */
  shape?: string | null
  /** 생략하면 null. */
  titleInImage?: boolean | null
}

/**
 * 홈피드 카드 행 insert 페이로드를 만든다. 어드민 생성 API(POST `/api/admin/today`)는 body를 그대로 `insert`하므로 매핑이
 * 없다 — 여기서는 어드민 폼(`buildTodayCardSavePayload`)과 같은 값 모양(빈 값은 null·[]·기본값)으로 채운다.
 * 다른 점은 셋이다.
 * - `id`: 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID를 넣는다(라우트는 DB 기본값에 맡긴다).
 * - `cover_image_url`: 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함). 홈피드의 대표 이미지 컬럼은
 *   `image_url`이 아니라 `cover_image_url`이다.
 * - `image_source`: 기본은 `agent-generator`(묶음 값은 받지 않는다). 기존 seed SQL 등록 카드는 NULL이라 이 값으로 구분된다.
 *   서버가 다른 출처를 남기려면 `imageSource`로 넘긴다.
 * `layout_type`을 생략하면 폼이 템플릿을 고를 때 기본으로 고르는 추천값(`SUGGESTED_LAYOUT_FOR`)이다.
 * `created_by`·`created_at`은 넣지 않는다(스크립트에는 어드민 계정이 없어 NULL, 시각은 DB 기본값).
 * `shape`·`title_in_image`(마이그레이션 206)는 등록 묶음에 아직 칸이 없어 기본 NULL로 넣는다 — NULL은 옛 렌더러로
 * 그리는 기존 카드와 같은 값이다(티켓 20260930_1453 c1). 서버가 값을 정해 두었다면 `shape`·`titleInImage`로 넘긴다.
 * 키 집합은 생성 타입의 today_cards Insert와 같다(`pattern_no`는 없다).
 */
export function buildTodayCardInsertPayload(
  card: HomeFeedCardInput,
  { id, coverImageUrl, imageSource = AGENT_IMAGE_SOURCE, shape = null, titleInImage = null }: HomeFeedPayloadOptions
) {
  return {
    id,
    template_type: card.template_type,
    layout_type: card.layout_type ?? SUGGESTED_LAYOUT_FOR[card.template_type],
    title: card.title.trim(),
    subtitle: card.subtitle?.trim() || null,
    description: card.description?.trim() || null,
    cover_image_url: coverImageUrl,
    badge_ids: card.badge_ids ?? [],
    mission_id: card.mission_id ?? null,
    item_book_id: card.item_book_id ?? null,
    region_label: card.region_label?.trim() || null,
    body_markdown: card.body_markdown || null,
    ranking_mode_id: card.ranking_mode_id ?? null,
    recipe_id: card.recipe_id ?? null,
    content_type_id: card.content_type_id ?? null,
    target_href: card.target_href ?? null,
    exposure_tags: card.exposure_tags,
    starts_at: new Date(card.starts_at).toISOString(),
    ends_at: new Date(card.ends_at).toISOString(),
    sort_order: card.sort_order ?? 0,
    is_active: card.is_active ?? true,
    image_source: imageSource,
    shape,
    title_in_image: titleInImage,
  }
}
