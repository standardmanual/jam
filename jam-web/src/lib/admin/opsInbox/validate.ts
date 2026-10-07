/**
 * 운영 묶음 제출 본문 검증 (티켓 20260930_1816, 순수 함수).
 *
 * 검증은 두 층이다.
 * - `fatal`: 받을 수 없는 본문이다(400). 객체가 아님, `bundle_id`·`author` 없음이나 길이 초과, `is_sample`이 불리언이 아님,
 *   `items`가 배열이 아님, 항목 수 상한 초과.
 * - `errors`: 받아서 저장하고 응답으로 돌려주는 「형식 오류」다. 「경로: 사유」 문자열(해요체)이고,
 *   항목별 오류는 그 항목의 `format_errors`에도 같은 문장으로 담는다. 공통 필드(종류 허용값, 시각,
 *   연결 키 실재, `item_key` 중복, `user_experience` 유무, `week` 표기, `world_review` 규칙)와 카드 칸(티켓 20261001_1152:
 *   `shape`·`exposure_tags`·`tribe_id`·`color_pending`, 묶음의 `excluded_items`)만 본다.
 *   종류별 세부 검증은 티켓 20260930_1500이 승인 때 등록 전 검증으로 한다(상위 티켓 가정 12).
 *
 * 카드 칸: 홈피드 카드(`kind`가 `home_feed_card`)는 `shape`·`exposure_tags`가 필수이고(없으면 형식 오류, 저장은 한다),
 * 다른 종류는 값이 있을 때만 형식을 본다. `tribe_id`·`color_pending`은 선택이다. `tribe_id`가 실제 트라이브인지는
 * 호출한 쪽이 `tribes`를 조회해 `ctx.tribeIds`로 넘길 때만 본다(순수 함수라 DB를 부르지 않는다). 옛 형식 항목(`segment`만 있는
 * 항목)은 받아서 저장하고, 새 칸 오류만 붙는다. 칸을 읽는 쪽은 `fields.ts`다.
 *
 * 패턴 번호·지점 카테고리(티켓 20261007_1745): `pattern_no`는 `P01`처럼 `^P[0-9]{2,}$`여야 하고(숫자·`P-07`은 형식 오류), 패턴 사전에 있는 번호여야 한다.
 * `knobs.place_category`는 선택이며 값이 있으면 `poi_categories.slug` 문자열 배열이어야 한다(빈 배열은 허용, 나머지 `knobs`는 검사하지 않는다).
 * 사전·카테고리에 실제로 있는지는 호출한 쪽이 조회해 `ctx.patternNos`·`ctx.poiCategorySlugs`로 넘길 때만 본다. 어긋나도 저장·승인은 막지 않고
 * 형식 오류만 남긴다. 형식이 틀린 `pattern_no`는 항목의 `pattern_no` 열을 비워(null) 저장한다(제출 원본에는 그대로 남는다).
 *
 * `world_review` 규칙은 `jam-web/scripts/asset-generator/registerHomeFeedBundle.mjs`의
 * `validateWorldReview`(`WORLD_REVIEW_FIELDS`)와 같다. 그 스크립트는 지금의 등록 절차라 고치지 않고 규칙을
 * 여기에 다시 적었으며, 두 구현이 같은 입력에 같은 문장을 내는지 `validate.test.ts`가 대조한다.
 */
import type { Json } from '@/types/database.generated'
import { imageSpecWarnings, isImageKind } from './imageSpec'
import {
  MAX_ITEMS,
  OPS_EXCLUDED_ITEM_STAGES,
  OPS_HOME_FEED_CARD_KIND,
  OPS_ITEM_KINDS,
} from '@/lib/admin/opsInbox/constants'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { TODAY_EXPOSURE_TAG_OPTIONS } from '@/lib/admin/today-sections'
import { isUuid } from '@/lib/admin/uuid'
import { CARD_SHAPES, isCardShape } from '@/lib/today/shape'

// 신원 값의 길이 상한(티켓 20260930_2100). 넘으면 유일 인덱스 행 크기 제한에 걸려 500이 나므로 400으로 먼저 거절한다.
const MAX_BUNDLE_ID_LENGTH = 200
const MAX_AUTHOR_LENGTH = 100

/**
 * 검증이 밖에서 받는 재료. `tribeIds`는 `tribes`에 있는 트라이브 ID 전체(소문자)다 — 있으면 `tribe_id`가 그 안에 있는지까지 본다.
 * 없으면 형식(UUID)만 본다. `patternNos`는 패턴 사전(`ops_patterns`)의 번호 전체(보관 패턴 포함)이고, `poiCategorySlugs`는
 * `poi_categories.slug` 전체다 — 각각 있으면 `pattern_no`·`knobs.place_category`가 그 안에 있는지까지 보고, 없으면 형식만 본다.
 */
export interface OpsValidationContext {
  tribeIds?: ReadonlySet<string>
  patternNos?: ReadonlySet<string>
  poiCategorySlugs?: ReadonlySet<string>
}

export interface ValidatedOpsBundle {
  bundle_id: string
  author: string
  week: string | null
  hypothesis: string | null
  routine_run: Json | null
  color_rationale_link: string | null
  is_sample: boolean
}

export interface ValidatedOpsItem {
  position: number
  item_key: string | null
  kind: string | null
  pattern_no: string | null
  /** 시간대가 붙은 ISO 8601로 검증된 값만 UTC ISO 문자열로 담는다. 아니면 null. */
  starts_at: string | null
  ends_at: string | null
  /** 제출 항목 원본. 객체가 아닌 항목은 `{ value }`로 감싼다(DB의 jsonb NOT NULL이 JSON null을 받지 못한다). */
  original: Json
  format_errors: string[]
  /** 저장하지 않는 경고(제출 응답에만 싣는다). 오류가 아니라 제출을 막지 않는다. */
  warnings: string[]
}

export interface OpsBundleValidation {
  /** 비어 있지 않으면 400이다. 이때 `bundle`은 null, `items`·`errors`는 빈 배열이다. */
  fatal: string[]
  /** 저장하고 돌려주는 형식 오류 전체(묶음 + 항목). */
  errors: string[]
  bundle: ValidatedOpsBundle | null
  items: ValidatedOpsItem[]
  /** 항목 경고 전체. 오류와 달리 DB에 저장하지 않는다. */
  warnings: string[]
}

// ── world_review 규칙: registerHomeFeedBundle.mjs와 같은 규칙·같은 문장 ─────────────────────────
export const WORLD_REVIEW_FIELDS = ['world_related', 'winter_reviewed', 'reason'] as const

// registerBundle.mjs의 CONTROL_OR_LINE_BREAK와 같다.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/
// registerHomeFeedBundle.mjs의 ISO_DATE_TIME_PATTERN과 같다(시간대 필수).
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null
}

export function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

function describeValue(value: unknown): string {
  if (value === undefined) return '없음'
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}

/** 사유에 넣는 값은 길이를 자른다(본문은 1MB까지 받으므로 오류 문장이 그만큼 커지지 않게 한다). */
function describeShort(value: unknown): string {
  const text = describeValue(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/**
 * 세계관 검수 결과 검증. `path`는 오류 문장 앞에 붙는 경로다(묶음 최상위는 `world_review`, 항목은
 * `items[2].world_review`). 값이 없으면(undefined·null) 「필수 항목이 없어요」 한 줄이다.
 */
export function validateWorldReview(review: unknown, path = 'world_review'): string[] {
  const errors: string[] = []
  if (!isPresent(review)) {
    errors.push(`${path}: 필수 항목이 없어요.`)
    return errors
  }
  if (!isPlainObject(review)) {
    errors.push(`${path}: 객체여야 해요.`)
    return errors
  }
  const unknownKeys = Object.keys(review).filter(
    (key) => !(WORLD_REVIEW_FIELDS as readonly string[]).includes(key)
  )
  if (unknownKeys.length > 0) {
    errors.push(`${path}: 알 수 없는 필드예요 — ${unknownKeys.join(', ')}. 지원 필드: ${WORLD_REVIEW_FIELDS.join(', ')}`)
  }
  for (const key of WORLD_REVIEW_FIELDS) {
    if (!isPresent(review[key])) errors.push(`${path}.${key}: 필수 항목이 없어요.`)
  }
  for (const key of ['world_related', 'winter_reviewed']) {
    if (isPresent(review[key]) && typeof review[key] !== 'boolean') {
      errors.push(`${path}.${key}: true 또는 false여야 해요(받은 값: ${describeValue(review[key])}).`)
    }
  }
  const reason = review.reason
  if (isPresent(reason)) {
    if (!isNonEmptyString(reason)) errors.push(`${path}.reason: 비어 있지 않은 문자열이어야 해요.`)
    else if (CONTROL_OR_LINE_BREAK.test(reason)) {
      errors.push(`${path}.reason: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`)
    }
  }
  // 세계관 내용이 있으면 윈터 검수를 거쳐야 한다. 순수 운영성이면 검수 없이 진행하되 사유를 남긴다.
  if (review.world_related === true && review.winter_reviewed === false) {
    errors.push(
      `${path}.winter_reviewed: 세계관과 닿는 카드(world_related=true)는 윈터 검수를 거쳐야 해서 true여야 해요.`
    )
  }
  return errors
}

// ── 카드 칸·뺀 항목 (티켓 20261001_1152) ─────────────────────────────────────────────────────────

// registerHomeFeedBundle.mjs의 EXPOSURE_TAGS와 같은 원천(`today-sections.ts`)이다.
const EXPOSURE_TAGS: readonly string[] = TODAY_EXPOSURE_TAG_OPTIONS.map((option) => option.value)

/**
 * 노출 대상(`exposure_tags`) 값 검사. 태그 1개 이상, 허용 목록 안, 중복 없음. 문장은 registerHomeFeedBundle.mjs의
 * `card.exposure_tags` 검사와 같다(앞의 경로만 다르다). 값이 없는 경우는 부르는 쪽이 가린다 — 여기서는 「배열이어야 해요」다.
 */
export function validateExposureTags(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [`${path}: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).`]
  }
  const invalid = value.filter((tag) => typeof tag !== 'string' || !EXPOSURE_TAGS.includes(tag))
  if (invalid.length > 0) {
    return [`${path}: 허용하지 않는 태그예요 — ${invalid.map(describeValue).join(', ')}. 허용 태그: ${EXPOSURE_TAGS.join(', ')}`]
  }
  if (new Set(value).size !== value.length) return [`${path}: 같은 태그를 두 번 넣을 수 없어요.`]
  return []
}

/**
 * 항목의 카드 칸 검사(`shape`·`exposure_tags`·`tribe_id`·`color_pending`). `path`는 `items[2]`다.
 * 홈피드 카드는 `shape`·`exposure_tags`가 필수이고, 다른 종류는 값이 있을 때만 본다. `tribe_id`는 null을 「없음」으로 본다.
 */
export function validateOpsCardFields(raw: Record<string, unknown>, path: string, ctx: OpsValidationContext = {}): string[] {
  const errors: string[] = []
  const isCard = raw.kind === OPS_HOME_FEED_CARD_KIND

  if (!isPresent(raw.shape)) {
    if (isCard) errors.push(`${path}.shape: 필수 항목이 없어요(카드 모양을 ${CARD_SHAPES.join(', ')} 중 하나로 적어 주세요).`)
  } else if (!isCardShape(raw.shape)) {
    errors.push(`${path}.shape: 허용되지 않는 카드 모양이에요(받은 값: ${describeShort(raw.shape)}). 허용값: ${CARD_SHAPES.join(', ')}`)
  }

  if (!isPresent(raw.exposure_tags)) {
    if (isCard) errors.push(`${path}.exposure_tags: 필수 항목이 없어요(노출 대상을 태그 배열로 적어 주세요. 전원이면 ["all"]).`)
  } else {
    errors.push(...validateExposureTags(raw.exposure_tags, `${path}.exposure_tags`))
  }

  if (isPresent(raw.tribe_id)) {
    if (typeof raw.tribe_id !== 'string' || !isUuid(raw.tribe_id)) {
      errors.push(`${path}.tribe_id: 트라이브 ID(UUID) 형식이어야 해요(받은 값: ${describeShort(raw.tribe_id)}).`)
    } else if (ctx.tribeIds && !ctx.tribeIds.has(raw.tribe_id.toLowerCase())) {
      errors.push(`${path}.tribe_id: 없는 트라이브예요(받은 값: ${describeShort(raw.tribe_id)}). 트라이브 ID를 확인해 주세요.`)
    }
  }

  if (isPresent(raw.color_pending) && typeof raw.color_pending !== 'boolean') {
    errors.push(`${path}.color_pending: true 또는 false여야 해요(받은 값: ${describeShort(raw.color_pending)}).`)
  }

  return errors
}

/**
 * 패턴 번호 형식 판정. 문자열이고 앞뒤 공백을 뗀 값이 `P01`처럼 `^P[0-9]{2,}$`에 맞으면 그 번호를, 아니면 `null`을 돌려준다
 * (숫자·`P-07`·`p07`은 `null`). 값이 있는지(`isPresent`)는 부르는 쪽이 먼저 가린다. 읽기 쪽(`fields.ts`)도 같은 함수를 쓴다.
 */
export function normalizeOpsPatternNo(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return OPS_PATTERN_NO_PATTERN.test(trimmed) ? trimmed : null
}

/** 오류 문장에 값을 늘어놓을 때 앞의 몇 개만 보인다. */
const MAX_LISTED_VALUES = 5

/**
 * 항목의 지점 카테고리(`knobs.place_category`) 검사. `path`는 항목 경로(`items[2]`)다. `knobs`가 객체가 아니거나 `place_category`가
 * 없으면(undefined·null) 검사하지 않는다(나머지 `knobs`는 검사 없음). 값이 있으면 비어 있지 않은 문자열의 배열이어야 하고(빈 배열은 허용),
 * `slugs`를 받았으면 각 값이 그 안에 있어야 한다. 어긋나는 값은 한 줄로 모아 알린다.
 */
export function validateOpsPlaceCategory(knobs: unknown, path: string, slugs?: ReadonlySet<string>): string[] {
  if (!isPlainObject(knobs) || !isPresent(knobs.place_category)) return []
  const at = `${path}.knobs.place_category`
  const value = knobs.place_category
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    return [`${at}: 지점 카테고리 slug를 문자열로 넣은 배열이어야 해요(받은 값: ${describeShort(value)}).`]
  }
  if (!slugs) return []
  const missing = value.filter((slug) => !slugs.has(slug))
  if (missing.length === 0) return []
  const listed = missing.slice(0, MAX_LISTED_VALUES).map(describeValue).join(', ')
  const rest = missing.length > MAX_LISTED_VALUES ? ` 외 ${missing.length - MAX_LISTED_VALUES}개` : ''
  return [`${at}: 없는 지점 카테고리예요 — ${listed}${rest}. 카테고리 slug를 확인해 주세요.`]
}

/**
 * 묶음의 뺀 항목(`excluded_items`) 검사. 없으면(undefined·null) 오류가 아니다. 원소마다 `reason`은 필수(`world_review.reason`과
 * 같은 규칙: 비어 있지 않은 한 줄)이고, `item_key`는 문자열, `kind`·`stage`는 허용값이다. 이 오류는 묶음 오류에만 담는다.
 */
export function validateExcludedItems(value: unknown, path = 'excluded_items'): string[] {
  if (!isPresent(value)) return []
  if (!Array.isArray(value)) return [`${path}: 배열이어야 해요(받은 값: ${describeShort(value)}).`]

  const errors: string[] = []
  value.forEach((entry: unknown, index: number) => {
    const at = `${path}[${index}]`
    if (!isPlainObject(entry)) {
      errors.push(`${at}: 객체여야 해요(받은 값: ${describeShort(entry)}).`)
      return
    }
    if (!isPresent(entry.reason)) {
      errors.push(`${at}.reason: 필수 항목이 없어요(뺀 이유를 한 줄로 적어 주세요).`)
    } else if (!isNonEmptyString(entry.reason)) {
      errors.push(`${at}.reason: 비어 있지 않은 문자열이어야 해요.`)
    } else if (CONTROL_OR_LINE_BREAK.test(entry.reason)) {
      errors.push(`${at}.reason: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`)
    }
    if (isPresent(entry.item_key) && typeof entry.item_key !== 'string') {
      errors.push(`${at}.item_key: 문자열이어야 해요(받은 값: ${describeShort(entry.item_key)}).`)
    }
    if (isPresent(entry.kind) && (typeof entry.kind !== 'string' || !(OPS_ITEM_KINDS as readonly string[]).includes(entry.kind))) {
      errors.push(`${at}.kind: 허용되지 않는 종류예요(받은 값: ${describeShort(entry.kind)}). 허용값: ${OPS_ITEM_KINDS.join(', ')}`)
    }
    if (
      isPresent(entry.stage) &&
      (typeof entry.stage !== 'string' || !(OPS_EXCLUDED_ITEM_STAGES as readonly string[]).includes(entry.stage))
    ) {
      errors.push(
        `${at}.stage: 허용되지 않는 단계예요(받은 값: ${describeShort(entry.stage)}). 허용값: ${OPS_EXCLUDED_ITEM_STAGES.join(', ')}`
      )
    }
  })
  return errors
}

// ── 항목 ─────────────────────────────────────────────────────────────────────────────────────────

function validateItem(
  raw: unknown,
  position: number,
  ownKey: string | null,
  firstIndexByKey: Map<string, number>,
  allKeys: Set<string>,
  ctx: OpsValidationContext
): ValidatedOpsItem {
  const path = `items[${position}]`
  const errors: string[] = []

  if (!isPlainObject(raw)) {
    errors.push(`${path}: 객체여야 해요(받은 값: ${describeShort(raw)}).`)
    return {
      position,
      item_key: null,
      kind: null,
      pattern_no: null,
      starts_at: null,
      ends_at: null,
      original: { value: raw as Json },
      format_errors: errors,
      warnings: [],
    }
  }

  // item_key: 비어 있지 않은 문자열이고 묶음 안에서 겹치지 않아야 한다.
  if (!isPresent(raw.item_key)) {
    errors.push(`${path}.item_key: 필수 항목이 없어요.`)
  } else if (!isNonEmptyString(raw.item_key)) {
    errors.push(`${path}.item_key: 비어 있지 않은 문자열이어야 해요.`)
  } else {
    const first = firstIndexByKey.get(raw.item_key)
    if (first !== undefined && first !== position) {
      errors.push(
        `${path}.item_key: items[${first}]와 같은 값이에요(${describeShort(raw.item_key)}). 항목마다 다른 값을 써 주세요.`
      )
    }
  }

  // kind: 허용값 7개
  let kind: string | null = null
  if (!isPresent(raw.kind)) {
    errors.push(`${path}.kind: 필수 항목이 없어요.`)
  } else if (typeof raw.kind !== 'string' || !(OPS_ITEM_KINDS as readonly string[]).includes(raw.kind)) {
    errors.push(
      `${path}.kind: 허용되지 않는 종류예요(받은 값: ${describeShort(raw.kind)}). 허용값: ${OPS_ITEM_KINDS.join(', ')}`
    )
  }
  if (typeof raw.kind === 'string') kind = raw.kind

  // pattern_no: 선택. 있으면 P01 형식이고 패턴 사전에 있는 번호여야 한다. 형식이 틀리면 열은 비우고(null) 원본에만 남긴다.
  // 사전에 없는 번호는 열에 그대로 두고 오류만 남긴다(어느 쪽이든 저장·승인은 막지 않는다).
  let patternNo: string | null = null
  if (isPresent(raw.pattern_no)) {
    patternNo = normalizeOpsPatternNo(raw.pattern_no)
    if (patternNo === null) {
      errors.push(
        `${path}.pattern_no: 패턴 번호는 P01처럼 P 뒤에 숫자 두 자리 이상이어야 해요(받은 값: ${describeShort(raw.pattern_no)}).`
      )
    } else if (ctx.patternNos && !ctx.patternNos.has(patternNo)) {
      errors.push(`${path}.pattern_no: 패턴 사전에 없는 번호예요(받은 값: ${describeShort(patternNo)}). 패턴 번호를 확인해 주세요.`)
    }
  }

  // starts_at·ends_at: 시간대가 붙은 ISO 8601, 종료가 공개보다 늦어야 한다.
  let startsAt: string | null = null
  let endsAt: string | null = null
  for (const key of ['starts_at', 'ends_at'] as const) {
    const value = raw[key]
    if (!isPresent(value)) continue
    if (!isIsoDateTime(value)) {
      errors.push(
        `${path}.${key}: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-10-05T09:00:00+09:00, 받은 값: ${describeShort(value)}).`
      )
      continue
    }
    const iso = new Date(value).toISOString()
    if (key === 'starts_at') startsAt = iso
    else endsAt = iso
  }
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    errors.push(`${path}.ends_at: 공개 시각(starts_at)보다 늦어야 해요.`)
  }

  // user_experience: 「유저가 겪는 것」 한 문장이 있어야 한다.
  if (!isPresent(raw.user_experience)) {
    errors.push(`${path}.user_experience: 필수 항목이 없어요(「유저가 겪는 것」을 쉬운 한 문장으로 적어 주세요).`)
  } else if (!isNonEmptyString(raw.user_experience)) {
    errors.push(`${path}.user_experience: 비어 있지 않은 문자열이어야 해요.`)
  }

  // links: 이 묶음의 다른 항목의 item_key를 가리켜야 한다.
  if (isPresent(raw.links)) {
    if (!Array.isArray(raw.links)) {
      errors.push(`${path}.links: 배열이어야 해요(받은 값: ${describeShort(raw.links)}).`)
    } else {
      raw.links.forEach((link: unknown, index: number) => {
        if (!isNonEmptyString(link)) {
          errors.push(`${path}.links[${index}]: 비어 있지 않은 문자열이어야 해요.`)
        } else if (ownKey !== null && link === ownKey) {
          errors.push(`${path}.links[${index}]: 자기 자신을 가리킬 수 없어요(${describeShort(link)}).`)
        } else if (!allKeys.has(link)) {
          errors.push(`${path}.links[${index}]: 이 묶음에 그런 item_key가 없어요(받은 값: ${describeShort(link)}).`)
        }
      })
    }
  }

  errors.push(...validateWorldReview(raw.world_review, `${path}.world_review`))
  errors.push(...validateOpsCardFields(raw, path, ctx))
  errors.push(...validateOpsPlaceCategory(raw.knobs, path, ctx.poiCategorySlugs))

  // image_spec: 선택 칸이다. 이미지 칸이 있는 종류에서 비어 있거나, 값이 있는데 모양이 틀리면 경고만 낸다(오류 아님).
  const warnings = isImageKind(kind) || isPresent(raw.image_spec) ? imageSpecWarnings(raw.image_spec, path) : []

  return {
    position,
    item_key: isNonEmptyString(raw.item_key) ? raw.item_key : null,
    kind,
    pattern_no: patternNo,
    starts_at: startsAt,
    ends_at: endsAt,
    original: raw as Json,
    format_errors: errors,
    warnings,
  }
}

// ── 수정 뒤 다시 검사 (티켓 20260930_1818) ────────────────────────────────────────────────────────

/** 같은 묶음 항목 하나의 자리와 `item_key`. 다시 검사할 때 `item_key` 중복·연결 실재를 판정하는 재료다. */
export interface BundleItemKeyRef {
  position: number
  itemKey: string | null
}

/**
 * 직접 수정으로 바뀐 항목 하나를 다시 검사한다(수정본을 제출 원본 위에 덮은 항목 한 벌 `raw`). 제출 때 검사와 같은 규칙·같은
 * 문장을 내려고 안쪽 `validateItem`을 그대로 쓴다. `bundleItems`는 묶음 전체 항목의 자리와 `item_key`다. `ctx`는 제출 때와 같은
 * 트라이브·패턴 번호·지점 카테고리 목록을 넘겨 같은 판정을 내게 한다.
 */
export function revalidateOpsItem(
  raw: unknown,
  position: number,
  bundleItems: readonly BundleItemKeyRef[],
  ctx: OpsValidationContext = {}
): ValidatedOpsItem {
  const firstIndexByKey = new Map<string, number>()
  const allKeys = new Set<string>()
  for (const { position: at, itemKey } of [...bundleItems].sort((a, b) => a.position - b.position)) {
    if (!isNonEmptyString(itemKey)) continue
    if (!firstIndexByKey.has(itemKey)) firstIndexByKey.set(itemKey, at)
    allKeys.add(itemKey)
  }
  const ownKey = isPlainObject(raw) && isNonEmptyString(raw.item_key) ? raw.item_key : null
  return validateItem(raw, position, ownKey, firstIndexByKey, allKeys, ctx)
}

// 배경색 필드(`components/admin/BackgroundColorField.tsx`의 `HEX_COLOR_PATTERN`)와 같은 규칙이다. 그 파일은 클라이언트 모듈이라
// 서버 코드가 값을 가져올 수 없어 다시 적었고, `validate.test.ts`가 두 식이 같은지 대조한다.
export const EDIT_HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** 수정 때만 하는 색 검사(제출 검증은 색을 보지 않는다). 통과하면 null, 아니면 화면에 보일 문장이다. */
export function validateEditedColor(value: string): string | null {
  return EDIT_HEX_COLOR_PATTERN.test(value) ? null : '색은 #rrggbb 형식으로 적어 주세요. 예: #1a2b3c'
}

// ── 묶음 ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * 제출 본문을 검증한다. 오류를 첫 줄에서 멈추지 않고 모두 모아 한 번에 알린다(에이전트가 한 번에 고친다).
 */
export function validateOpsBundle(raw: unknown, ctx: OpsValidationContext = {}): OpsBundleValidation {
  const fatal: string[] = []

  if (!isPlainObject(raw)) {
    return { fatal: ['본문의 최상위는 객체여야 해요.'], errors: [], warnings: [], bundle: null, items: [] }
  }

  if (!isPresent(raw.bundle_id)) fatal.push('bundle_id: 필수 항목이 없어요.')
  else if (!isNonEmptyString(raw.bundle_id)) fatal.push('bundle_id: 비어 있지 않은 문자열이어야 해요.')
  else if (raw.bundle_id.length > MAX_BUNDLE_ID_LENGTH) {
    fatal.push(`bundle_id: ${MAX_BUNDLE_ID_LENGTH}자까지 받아요(받은 길이: ${raw.bundle_id.length}자).`)
  }

  if (!isPresent(raw.author)) fatal.push('author: 필수 항목이 없어요.')
  else if (!isNonEmptyString(raw.author)) fatal.push('author: 비어 있지 않은 문자열이어야 해요.')
  else if (raw.author.length > MAX_AUTHOR_LENGTH) {
    fatal.push(`author: ${MAX_AUTHOR_LENGTH}자까지 받아요(받은 길이: ${raw.author.length}자).`)
  }

  // 시험 여부는 저장 뒤 바로잡을 수 없으므로(시험 묶음이 학습 재료에 섞인다) 형식이 틀리면 저장하지 않는다.
  if (isPresent(raw.is_sample) && typeof raw.is_sample !== 'boolean') {
    fatal.push(`is_sample: true 또는 false여야 해요(받은 값: ${describeShort(raw.is_sample)}).`)
  }

  const rawItems = raw.items
  if (!Array.isArray(rawItems)) {
    fatal.push('items: 배열이어야 해요(항목이 없으면 빈 배열 []로 보내 주세요).')
  } else if (rawItems.length > MAX_ITEMS) {
    fatal.push(`items: 항목은 한 묶음에 ${MAX_ITEMS}개까지 받아요(받은 개수: ${rawItems.length}).`)
  }

  if (fatal.length > 0 || !Array.isArray(rawItems)) {
    return { fatal, errors: [], warnings: [], bundle: null, items: [] }
  }

  const bundleErrors: string[] = []

  let week: string | null = null
  if (isPresent(raw.week)) {
    const match = typeof raw.week === 'string' ? WEEK_PATTERN.exec(raw.week) : null
    const weekNo = match ? Number(match[2]) : 0
    if (!match || weekNo < 1 || weekNo > 53) {
      bundleErrors.push(`week: YYYY-Www 형식이어야 해요(예: 2026-W41, 받은 값: ${describeShort(raw.week)}).`)
    } else {
      week = raw.week as string
    }
  }

  let hypothesis: string | null = null
  if (isPresent(raw.hypothesis)) {
    if (typeof raw.hypothesis === 'string') hypothesis = raw.hypothesis
    else bundleErrors.push(`hypothesis: 문자열이어야 해요(받은 값: ${describeShort(raw.hypothesis)}).`)
  }

  let colorRationaleLink: string | null = null
  if (isPresent(raw.color_rationale_link)) {
    if (typeof raw.color_rationale_link === 'string') colorRationaleLink = raw.color_rationale_link
    else {
      bundleErrors.push(`color_rationale_link: 문자열이어야 해요(받은 값: ${describeShort(raw.color_rationale_link)}).`)
    }
  }

  let routineRun: Json | null = null
  if (isPresent(raw.routine_run)) {
    if (isPlainObject(raw.routine_run)) routineRun = raw.routine_run as Json
    else bundleErrors.push(`routine_run: 객체여야 해요(받은 값: ${describeShort(raw.routine_run)}).`)
  }

  // 뺀 항목은 묶음 오류에만 담는다(어느 항목에도 속하지 않는다).
  bundleErrors.push(...validateExcludedItems(raw.excluded_items))

  // 불리언이 아닌 값은 위 fatal에서 이미 거절했다.
  const isSample = raw.is_sample === true

  // item_key 색인: 중복 판정(먼저 나온 위치)과 links 실재 확인에 쓴다.
  const firstIndexByKey = new Map<string, number>()
  const allKeys = new Set<string>()
  rawItems.forEach((item: unknown, index: number) => {
    if (isPlainObject(item) && isNonEmptyString(item.item_key)) {
      if (!firstIndexByKey.has(item.item_key)) firstIndexByKey.set(item.item_key, index)
      allKeys.add(item.item_key)
    }
  })

  const items = rawItems.map((item: unknown, index: number) => {
    const ownKey = isPlainObject(item) && isNonEmptyString(item.item_key) ? item.item_key : null
    return validateItem(item, index, ownKey, firstIndexByKey, allKeys, ctx)
  })

  return {
    fatal: [],
    errors: [...bundleErrors, ...items.flatMap((item) => item.format_errors)],
    warnings: items.flatMap((item) => item.warnings),
    bundle: {
      bundle_id: (raw.bundle_id as string).trim(),
      author: (raw.author as string).trim(),
      week,
      hypothesis,
      routine_run: routineRun,
      color_rationale_link: colorRationaleLink,
      is_sample: isSample,
    },
    items,
  }
}
