/**
 * JAM! 에셋 제너레이터 홈피드 카드 등록 묶음 — 읽기·검증·카드 행 매핑 (티켓 20260925_1413)
 *
 * 등록 묶음(`bundle.json`)의 형식 정본은 `docs/specs/prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md`다.
 * 이 파일은 그 문서의 검증 규칙을 코드로 옮긴 순수 함수 모음이다(파일 읽기는 이미지 존재·PNG 여부
 * 확인에만 쓴다). DB·저장소에는 쓰지 않는다.
 *
 * ## 배지·미션 등록 모듈과의 관계 (티켓 1413 결정 기록 2)
 * 배지 5개 파일과 미션 4개 파일은 검증이 끝난 자산이라 **고치지 않는다.** 내용과 무관한 부품(`readBundleFile`·
 * `findPreviousRecordError`·`UUID_PATTERN`·`AGENT_IMAGE_SOURCE`)만 `registerBundle.mjs`에서 가져오고, 그 파일에서
 * 비공개인 이미지 검증·문자열 검사는 이 파일에 홈피드용으로 다시 적었다. UUID 정규식은 `registerBundle.mjs`
 * 한 곳만 쓴다(티켓 2202·1412 게이트 교훈).
 *
 * ## 검증 규칙의 원천 (티켓 1413 결정 기록 3)
 * 어드민 `today_cards` 생성 API(`api/admin/today/route.ts` POST)는 본문을 검증 없이 insert하므로 «재사용할 검증 함수»가
 * 없다. 규칙은 어드민 폼(`TodayCardForm.tsx`의 `collectMissing`: 제목·노출 조건 태그 1개 이상·시작·종료 일시)과
 * `lib/admin/today-sections.ts`의 상수, DB CHECK 제약(마이그레이션 048·049·158·183·190)에 있다. 폼은 UI 컴포넌트라
 * 가져올 수 없어 같은 규칙을 이 파일의 순수 함수로 다시 적되, **허용값 목록은 `today-sections.ts` 상수를 그대로
 * import한다**(목록이 갈라지지 않게 — `registerHomeFeedBundle.test.ts`가 DB CHECK 마이그레이션과도 대조한다).
 *
 * insert 페이로드 기준은 `src/types/database.generated.ts`의 today_cards Insert 타입이다. 컬럼 목록이 어긋나면
 * 테스트("생성 타입 컬럼 대조")가 실패한다.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  SUGGESTED_LAYOUT_FOR,
  TODAY_CONTENT_TYPE_OPTIONS,
  TODAY_EXPOSURE_TAG_OPTIONS,
  TODAY_FIELDS_FOR,
  TODAY_LAYOUT_OPTIONS,
  TODAY_TEMPLATE_OPTIONS,
} from '../../src/lib/admin/today-sections'
import { MAX_APPLY_IMAGE_BYTES } from '../../src/lib/admin/applyGeneratedImageConstants'
import { AGENT_IMAGE_SOURCE, UUID_PATTERN } from './registerBundle.mjs'

export { AGENT_IMAGE_SOURCE, UUID_PATTERN, findPreviousRecordError, readBundleFile } from './registerBundle.mjs'

export const BUNDLE_TOP_REQUIRED = ['bundle_id', 'author', 'created_at', 'color_rationale_link', 'world_review', 'card', 'image']
export const CARD_REQUIRED_FIELDS = ['title', 'template_type', 'starts_at', 'ends_at', 'exposure_tags']
export const CARD_OPTIONAL_FIELDS = [
  'layout_type',
  'subtitle',
  'badge_ids',
  'mission_id',
  'item_book_id',
  'region_label',
  'body_markdown',
  'ranking_mode_id',
  'content_type_id',
  'target_href',
  'sort_order',
  'is_active',
]
export const WORLD_REVIEW_FIELDS = ['world_related', 'winter_reviewed', 'reason']
export const IMAGE_REQUIRED_FIELDS = ['path', 'seed', 'preset_id', 'bg_color', 'end_color']
export const IMAGE_OPTIONAL_FIELDS = ['text', 'subtext']

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
  ranking_mode_id: 'rankingMode',
  target_href: 'targetHref',
}

/**
 * 템플릿마다 «이 값이 없으면 카드가 의미가 없는» 참조 필드(목록 중 하나 이상). 어드민 폼은 이 값을 강제하지 않는다 —
 * 자동 경로(사람이 화면을 보며 채우지 않는 경로)라서 빈 카드가 실수로 등록되지 않게 이 스크립트가 더한 규칙이다.
 * 각 필드는 그 템플릿의 `TODAY_FIELDS_FOR`가 허용하는 것이어야 한다(테스트로 고정).
 */
export const REQUIRED_REFERENCE_FIELDS = {
  badge_spotlight: ['badge_ids'],
  progress_nudge: ['badge_ids', 'mission_id'],
  mission_spotlight: ['mission_id'],
  itembook_milestone: ['item_book_id'],
  location_trend: ['region_label'],
  drop_alert: [],
  editorial_article: ['body_markdown'],
  ranking_board: ['ranking_mode_id'],
}

const BUNDLE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// 한 줄 텍스트(작성자·카드 제목 등) 검사. 이 값들은 등록 기록 SQL(registration.sql)의 `--` 주석에도 들어가고 그 파일은
// 마이그레이션 폴더에 커밋되어 다시 실행될 수 있다. 줄바꿈이 섞이면 뒷부분이 주석 밖의 실행 가능한 문장이 되므로
// (티켓 20260924_2202 게이트 재현) 개행·제어 문자를 검증에서 거절한다.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/
// 본문(body_markdown)만 줄바꿈·탭을 허용한다. SQL 값은 문자열 리터럴로만 들어가고 주석에는 쓰지 않는다.
const BODY_FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasControlOrLineBreak(value) {
  return typeof value === 'string' && CONTROL_OR_LINE_BREAK.test(value)
}

function isIsoDateTime(value) {
  return typeof value === 'string' && ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

function isPresent(value) {
  return value !== undefined && value !== null
}

function describeValue(value) {
  if (value === undefined) return '없음'
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((key) => !allowed.includes(key))
}

function checkRequired(errors, prefix, obj, keys) {
  for (const key of keys) {
    if (!isPresent(obj[key])) errors.push(`${prefix}${key}: 필수 항목이 없어요.`)
  }
}

/** 한 줄 문자열 필드 검사(비어 있지 않고 줄바꿈·제어 문자가 없어야 한다). 값이 없으면 아무것도 하지 않는다. */
function checkOneLine(errors, label, value) {
  if (!isPresent(value)) return
  if (!isNonEmptyString(value)) errors.push(`${label}: 비어 있지 않은 문자열이어야 해요.`)
  else if (hasControlOrLineBreak(value)) errors.push(`${label}: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`)
}

function validateWorldReview(errors, review) {
  if (!isPlainObject(review)) {
    errors.push('world_review: 객체여야 해요.')
    return
  }
  const unknown = unknownKeys(review, WORLD_REVIEW_FIELDS)
  if (unknown.length > 0) {
    errors.push(`world_review: 알 수 없는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${WORLD_REVIEW_FIELDS.join(', ')}`)
  }
  checkRequired(errors, 'world_review.', review, WORLD_REVIEW_FIELDS)

  for (const key of ['world_related', 'winter_reviewed']) {
    if (isPresent(review[key]) && typeof review[key] !== 'boolean') {
      errors.push(`world_review.${key}: true 또는 false여야 해요(받은 값: ${describeValue(review[key])}).`)
    }
  }
  checkOneLine(errors, 'world_review.reason', review.reason)
  // 세계관 내용이 있으면 윈터 검수를 거쳐야 한다(상위 티켓 1404 결정 6·11). 순수 운영성이면 검수 없이 진행하되 사유를 남긴다.
  if (review.world_related === true && review.winter_reviewed === false) {
    errors.push('world_review.winter_reviewed: 세계관과 닿는 카드(world_related=true)는 윈터 검수를 거쳐야 해서 true여야 해요.')
  }
}

/** 값이 «채워졌는가» — 빈 배열·빈 문자열은 채우지 않은 것으로 본다(폼도 이 값들을 null·[]로 저장한다). */
function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return isPresent(value)
}

function checkUuidField(errors, key, value) {
  if (isPresent(value) && !(typeof value === 'string' && UUID_PATTERN.test(value))) {
    errors.push(`card.${key}: UUID 형식이어야 해요(받은 값: ${describeValue(value)}).`)
  }
}

function validateCard(errors, card) {
  const prefix = 'card.'
  if (!isPlainObject(card)) {
    errors.push('card: 객체여야 해요.')
    return
  }

  const supportedKeys = [...CARD_REQUIRED_FIELDS, ...CARD_OPTIONAL_FIELDS]
  const unknown = unknownKeys(card, supportedKeys)
  if (unknown.length > 0) {
    errors.push(`card: 묶음이 지원하지 않는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${supportedKeys.join(', ')}`)
  }
  checkRequired(errors, prefix, card, CARD_REQUIRED_FIELDS)

  // 분류 — 템플릿·노출 형태는 어드민 폼 선택지와 같은 목록이다.
  let templateOk = false
  if (isPresent(card.template_type)) {
    if (typeof card.template_type !== 'string' || !TEMPLATE_TYPES.includes(card.template_type)) {
      errors.push(`card.template_type: ${TEMPLATE_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(card.template_type)}).`)
    } else {
      templateOk = true
    }
  }
  if (isPresent(card.layout_type) && !(typeof card.layout_type === 'string' && LAYOUT_TYPES.includes(card.layout_type))) {
    errors.push(`card.layout_type: ${LAYOUT_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(card.layout_type)}).`)
  }

  // 기본 정보
  checkOneLine(errors, 'card.title', card.title)
  checkOneLine(errors, 'card.subtitle', card.subtitle)
  checkOneLine(errors, 'card.region_label', card.region_label)

  // 노출 조건 태그 — 폼 collectMissing과 같이 1개 이상, 허용 목록 안의 값.
  if (isPresent(card.exposure_tags)) {
    const tags = card.exposure_tags
    if (!Array.isArray(tags) || tags.length === 0) {
      errors.push('card.exposure_tags: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).')
    } else {
      const invalid = tags.filter((tag) => typeof tag !== 'string' || !EXPOSURE_TAGS.includes(tag))
      if (invalid.length > 0) {
        errors.push(`card.exposure_tags: 허용하지 않는 태그예요 — ${invalid.map(describeValue).join(', ')}. 허용 태그: ${EXPOSURE_TAGS.join(', ')}`)
      } else if (new Set(tags).size !== tags.length) {
        errors.push('card.exposure_tags: 같은 태그를 두 번 넣을 수 없어요.')
      }
    }
  }

  // 컨텐츠 유형 ID(T01~T17, 비움 허용) — DB CHECK(마이그레이션 183)와 같은 목록.
  if (isPresent(card.content_type_id) && !(typeof card.content_type_id === 'string' && CONTENT_TYPE_IDS.includes(card.content_type_id))) {
    errors.push(`card.content_type_id: ${CONTENT_TYPE_IDS[0]}~${CONTENT_TYPE_IDS[CONTENT_TYPE_IDS.length - 1]} 중 하나여야 해요(받은 값: ${describeValue(card.content_type_id)}).`)
  }

  // 참조 필드 형식
  if (isPresent(card.badge_ids)) {
    const ids = card.badge_ids
    if (!Array.isArray(ids) || ids.some((id) => !(typeof id === 'string' && UUID_PATTERN.test(id)))) {
      errors.push('card.badge_ids: 배지 ID(UUID) 문자열의 배열이어야 해요.')
    } else if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
      errors.push('card.badge_ids: 같은 배지를 두 번 넣을 수 없어요.')
    }
  }
  for (const key of ['mission_id', 'item_book_id', 'ranking_mode_id']) checkUuidField(errors, key, card[key])

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
  if (templateOk) {
    const fields = TODAY_FIELDS_FOR[card.template_type]
    for (const [key, fieldKey] of Object.entries(TEMPLATE_FIELD_KEY)) {
      if (isFilled(card[key]) && !fields[fieldKey]) {
        errors.push(`card.${key}: ${card.template_type} 템플릿은 이 필드를 쓰지 않아요(어드민 폼도 저장할 때 비워요). 묶음에서 빼 주세요.`)
      }
    }
    const required = REQUIRED_REFERENCE_FIELDS[card.template_type]
    if (required.length > 0 && !required.some((key) => isFilled(card[key]))) {
      errors.push(`card.${required.join(' 또는 card.')}: ${card.template_type} 템플릿은 이 참조가 있어야 카드가 의미가 있어요.`)
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

function inspectPngFile(absPath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return { error: `이미지 파일을 찾을 수 없어요: ${absPath}` }
  }
  const bytes = fs.statSync(absPath).size
  if (bytes === 0) return { error: `이미지 파일이 비어 있어요: ${absPath}` }
  const fd = fs.openSync(absPath, 'r')
  try {
    const head = Buffer.alloc(PNG_SIGNATURE.length)
    fs.readSync(fd, head, 0, head.length, 0)
    if (!head.equals(PNG_SIGNATURE)) return { error: `PNG 파일이 아니에요: ${absPath}` }
  } finally {
    fs.closeSync(fd)
  }
  if (bytes > MAX_APPLY_IMAGE_BYTES) {
    return { error: `이미지가 너무 커요(${(bytes / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 등록할 수 있어요.` }
  }
  return { bytes }
}

function validateImage(errors, image, bundleFile) {
  const prefix = 'image.'
  if (!isPlainObject(image)) {
    errors.push('image: 객체여야 해요.')
    return { absPath: null, bytes: null }
  }

  const supportedKeys = [...IMAGE_REQUIRED_FIELDS, ...IMAGE_OPTIONAL_FIELDS]
  const unknown = unknownKeys(image, supportedKeys)
  if (unknown.length > 0) {
    errors.push(`image: 알 수 없는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${supportedKeys.join(', ')}`)
  }
  checkRequired(errors, prefix, image, IMAGE_REQUIRED_FIELDS)

  let absPath = null
  let bytes = null
  if (isPresent(image.path)) {
    if (!isNonEmptyString(image.path)) {
      errors.push('image.path: 비어 있지 않은 문자열이어야 해요.')
    } else {
      absPath = path.isAbsolute(image.path) ? image.path : path.resolve(path.dirname(bundleFile), image.path)
      const inspected = inspectPngFile(absPath)
      if (inspected.error) errors.push(`image.path: ${inspected.error}`)
      else bytes = inspected.bytes
    }
  }

  if (isPresent(image.seed) && !Number.isSafeInteger(image.seed)) {
    errors.push(`image.seed: 정수여야 해요(받은 값: ${describeValue(image.seed)}).`)
  }
  if (isPresent(image.preset_id) && !(typeof image.preset_id === 'string' && UUID_PATTERN.test(image.preset_id))) {
    errors.push(`image.preset_id: 프리셋 ID(UUID) 형식이 아니에요(받은 값: ${describeValue(image.preset_id)}).`)
  }
  for (const key of ['bg_color', 'end_color']) {
    const value = image[key]
    if (isPresent(value) && !(typeof value === 'string' && HEX_COLOR_PATTERN.test(value))) {
      errors.push(`image.${key}: #rrggbb 형식이어야 해요(받은 값: ${describeValue(value)}).`)
    }
  }
  if (isPresent(image.text) && typeof image.text !== 'string') {
    errors.push('image.text: 문자열이어야 해요.')
  }
  if (isPresent(image.subtext) && typeof image.subtext !== 'string') {
    errors.push('image.subtext: 문자열이어야 해요.')
  }

  return { absPath, bytes }
}

/**
 * 파싱된 bundle.json을 검증한다. 고칠 수 있는 사유를 한 번에 모두 알리려고 첫 오류에서 멈추지 않고 전부
 * 모아 `errors`로 돌려준다.
 *
 * 인자: `raw`는 JSON.parse 결과, `bundleFile`은 bundle.json 절대경로(이미지 상대경로의 기준)다.
 * 반환: `{ errors, bundle }` — 오류가 없으면 `bundle`에 정규화된 묶음이 담기고
 * (`bundle.image.abs_path` 이미지 절대경로·`bundle.image.bytes` 원본 크기가 추가된다), 있으면 null이다.
 * (이 파일은 JSDoc 타입 주석을 쓰지 않는다 — TS 테스트가 이 .mjs를 import할 때 추론이 좁아져 호출이
 * 막히는 것을 피한다.)
 */
export function validateHomeFeedBundle(raw, { bundleFile }) {
  const errors = []
  if (!isPlainObject(raw)) {
    return { errors: ['묶음 파일의 최상위는 객체여야 해요.'], bundle: null }
  }

  const unknown = unknownKeys(raw, BUNDLE_TOP_REQUIRED)
  if (unknown.length > 0) {
    errors.push(`알 수 없는 최상위 필드예요 — ${unknown.join(', ')}. 지원 필드: ${BUNDLE_TOP_REQUIRED.join(', ')}`)
  }
  checkRequired(errors, '', raw, BUNDLE_TOP_REQUIRED)

  if (isPresent(raw.bundle_id)) {
    if (typeof raw.bundle_id !== 'string' || !BUNDLE_ID_PATTERN.test(raw.bundle_id) || raw.bundle_id.length > 60) {
      errors.push('bundle_id: 영문 소문자·숫자와 하이픈만 쓸 수 있어요(60자 이하, 예: 2026-10-05-weekly-mission-card).')
    }
  }
  checkOneLine(errors, 'author', raw.author)
  if (isPresent(raw.created_at) && !isIsoDateTime(raw.created_at)) {
    errors.push(`created_at: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-09-25T10:30:00+09:00, 받은 값: ${describeValue(raw.created_at)}).`)
  }
  const link = raw.color_rationale_link
  if (isPresent(link)) {
    const linkOk = typeof link === 'string' && (/^https?:\/\/\S+$/.test(link) || /^(docs|jam-doc)\/\S.*$/.test(link))
    if (!linkOk) {
      errors.push('color_rationale_link: http(s) 주소이거나 저장소 상대 경로(docs/… 또는 jam-doc/…)여야 해요.')
    }
  }

  if (isPresent(raw.world_review)) validateWorldReview(errors, raw.world_review)
  if (isPresent(raw.card)) validateCard(errors, raw.card)
  const imageInfo = isPresent(raw.image) ? validateImage(errors, raw.image, bundleFile) : { absPath: null, bytes: null }

  if (errors.length > 0) return { errors, bundle: null }

  return {
    errors,
    bundle: {
      ...raw,
      image: { ...raw.image, abs_path: imageInfo.absPath, bytes: imageInfo.bytes },
    },
  }
}

/**
 * 홈피드 카드 행 insert 페이로드를 만든다. 어드민 생성 API(POST `/api/admin/today`)는 body를 그대로 `insert`하므로 매핑이
 * 없다 — 여기서는 어드민 폼(`buildTodayCardSavePayload`)과 같은 값 모양(빈 값은 null·[]·기본값)으로 채운다.
 * 다른 점은 셋이다.
 * - `id`: 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID를 넣는다(라우트는 DB 기본값에 맡긴다).
 * - `cover_image_url`: 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함). 홈피드의 대표 이미지 컬럼은
 *   `image_url`이 아니라 `cover_image_url`이다.
 * - `image_source`: 항상 `agent-generator`(묶음 값은 받지 않는다). 기존 seed SQL 등록 카드는 NULL이라 이 값으로 구분된다.
 * `layout_type`을 생략하면 폼이 템플릿을 고를 때 기본으로 고르는 추천값(`SUGGESTED_LAYOUT_FOR`)이다.
 * `created_by`·`created_at`은 넣지 않는다(스크립트에는 어드민 계정이 없어 NULL, 시각은 DB 기본값).
 */
export function buildTodayCardInsertPayload(card, { id, coverImageUrl }) {
  return {
    id,
    template_type: card.template_type,
    layout_type: card.layout_type ?? SUGGESTED_LAYOUT_FOR[card.template_type],
    title: card.title.trim(),
    subtitle: card.subtitle?.trim() || null,
    cover_image_url: coverImageUrl,
    badge_ids: card.badge_ids ?? [],
    mission_id: card.mission_id ?? null,
    item_book_id: card.item_book_id ?? null,
    region_label: card.region_label?.trim() || null,
    body_markdown: card.body_markdown || null,
    ranking_mode_id: card.ranking_mode_id ?? null,
    content_type_id: card.content_type_id ?? null,
    target_href: card.target_href ?? null,
    exposure_tags: card.exposure_tags,
    starts_at: new Date(card.starts_at).toISOString(),
    ends_at: new Date(card.ends_at).toISOString(),
    sort_order: card.sort_order ?? 0,
    is_active: card.is_active ?? true,
    image_source: AGENT_IMAGE_SOURCE,
  }
}
