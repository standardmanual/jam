/**
 * JAM! 에셋 제너레이터 배지 등록 묶음 — 읽기·검증·배지 행 매핑 (티켓 20260924_2202)
 *
 * 등록 묶음(`bundle.json`)의 형식 정본은 `docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md`다.
 * 이 파일은 그 문서의 검증 규칙을 코드로 옮긴 순수 함수 모음이다(파일 읽기는 이미지 존재·PNG
 * 여부 확인에만 쓴다). DB·저장소에는 쓰지 않는다.
 *
 * ## 어드민 배지 생성 API와 같은 규칙
 * 배지 행 생성 규칙은 어드민 API(`jam-web/src/app/api/admin/badges/route.ts` POST)와 같아야 한다.
 * 그래서 검증 함수는 **재사용**한다(복사하지 않는다): `findRarityLevelError`·
 * `findBadgeConditionSaveError`(`lib/admin/badge-validation`), `isValidFamilyKey`
 * (`lib/admin/badge-families`). 재사용하는 함수가 내부에서 `@/` 별칭을 쓰므로 이 파일을 불러오는
 * 스크립트는 **cwd가 `jam-web`인 tsx**로 실행해야 한다(tsx가 cwd의 tsconfig paths를 읽는다 —
 * 저장소 루트에서 실행하면 `Cannot find module '@/lib/...'`로 실패하는 것을 실측했다).
 *
 * insertPayload 매핑(`buildBadgeInsertPayload`)은 라우트 안에 인라인이라 함수로 불러올 수 없다.
 * 라우트를 고치지 않는 범위에서 같은 매핑을 옮겼고, 라우트의 키 목록과 어긋나면 테스트
 * (`registerBundle.test.ts`의 "라우트 키 목록 대조")가 실패한다.
 */
import fs from 'node:fs'
import path from 'node:path'

import { findBadgeConditionSaveError, findRarityLevelError } from '../../src/lib/admin/badge-validation'
import { isValidFamilyKey } from '../../src/lib/admin/badge-families'
import { ADMIN_ACTIVITY_TYPES } from '../../src/lib/admin/badge-sections'
import { MAX_APPLY_IMAGE_BYTES } from '../../src/lib/admin/applyGeneratedImageConstants'

/** 1차에서 지원하는 배지 유형. checkin은 POI 연결이 필요해 범위 밖이다(REGISTRATION_BUNDLE.md §1). */
export const SUPPORTED_BADGE_TYPES = ['activity', 'item']

export const BUNDLE_TOP_REQUIRED = ['bundle_id', 'author', 'created_at', 'color_rationale_link', 'badge', 'image']
export const BADGE_REQUIRED_FIELDS = ['name', 'description', 'type']
export const BADGE_OPTIONAL_FIELDS = [
  'rarity',
  'level',
  'family_key',
  'sort_order',
  'activity_types',
  'point_reward',
  'drop_weight',
  'condition_json',
  'tribe_id',
  'item_book_id',
  'valid_from',
  'valid_until',
]
export const IMAGE_REQUIRED_FIELDS = ['path', 'seed', 'preset_id', 'bg_color', 'end_color']
export const IMAGE_OPTIONAL_FIELDS = ['text']

/** 이 스크립트가 등록하는 배지의 `badges.image_source` 값(마이그레이션 186 CHECK 허용값). */
export const AGENT_IMAGE_SOURCE = 'agent-generator'

const BUNDLE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isIsoDateTime(value) {
  return typeof value === 'string' && ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

function describeValue(value) {
  if (value === undefined) return '없음'
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}

/** bundle.json을 읽어 JSON으로 파싱한다. 파일이 없거나 JSON이 깨졌으면 한국어 Error를 던진다. */
export function readBundleFile(bundleFile) {
  if (!fs.existsSync(bundleFile) || !fs.statSync(bundleFile).isFile()) {
    throw new Error(`묶음 파일을 찾을 수 없어요: ${bundleFile}`)
  }
  const text = fs.readFileSync(bundleFile, 'utf8')
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`묶음 파일이 올바른 JSON이 아니에요: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((key) => !allowed.includes(key))
}

function checkRequired(errors, prefix, obj, keys) {
  for (const key of keys) {
    if (obj[key] === undefined || obj[key] === null) {
      errors.push(`${prefix}${key}: 필수 항목이 없어요.`)
    }
  }
}

function validateBadge(errors, badge) {
  const prefix = 'badge.'
  if (!isPlainObject(badge)) {
    errors.push('badge: 객체여야 해요.')
    return
  }

  const supportedKeys = [...BADGE_REQUIRED_FIELDS, ...BADGE_OPTIONAL_FIELDS]
  const unknown = unknownKeys(badge, supportedKeys)
  if (unknown.length > 0) {
    errors.push(
      `badge: 묶음이 지원하지 않는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${supportedKeys.join(', ')}`
    )
  }

  checkRequired(errors, prefix, badge, BADGE_REQUIRED_FIELDS)

  const { name, description, type } = badge
  if (name !== undefined && name !== null && !isNonEmptyString(name)) {
    errors.push('badge.name: 비어 있지 않은 문자열이어야 해요.')
  }
  if (description !== undefined && description !== null && !isNonEmptyString(description)) {
    errors.push('badge.description: 비어 있지 않은 문자열이어야 해요.')
  }

  let typeOk = false
  if (type !== undefined && type !== null) {
    if (type === 'checkin') {
      errors.push('badge.type: checkin 배지는 POI 연결이 필요해서 묶음으로 등록할 수 없어요(지원 유형: activity, item).')
    } else if (!SUPPORTED_BADGE_TYPES.includes(type)) {
      errors.push(`badge.type: activity 또는 item이어야 해요(받은 값: ${describeValue(type)}).`)
    } else {
      typeOk = true
    }
  }

  // 등급형/레벨형 배타 — 어드민 API와 같은 함수(`findRarityLevelError`)로 판정한다.
  const { rarity, level } = badge
  let rarityLevelTypesOk = true
  if (rarity !== undefined && rarity !== null && typeof rarity !== 'string') {
    errors.push('badge.rarity: 문자열이어야 해요(common · rare · epic · mystic).')
    rarityLevelTypesOk = false
  }
  if (level !== undefined && level !== null && typeof level !== 'number') {
    errors.push('badge.level: 숫자여야 해요(1 이상의 정수).')
    rarityLevelTypesOk = false
  }
  if (rarityLevelTypesOk) {
    const rarityLevelError = findRarityLevelError(rarity ?? null, level ?? null)
    if (rarityLevelError) errors.push(`badge.rarity/level: ${rarityLevelError}`)
  }

  // 계열 키 형식 — 라우트와 같은 판정(`isValidFamilyKey`).
  let familyKey = null
  if (badge.family_key !== undefined && badge.family_key !== null) {
    if (typeof badge.family_key !== 'string') {
      errors.push('badge.family_key: 문자열이어야 해요("종목:이름" 형태).')
    } else {
      familyKey = badge.family_key.trim() ? badge.family_key.trim() : null
      if (familyKey && !isValidFamilyKey(familyKey)) {
        errors.push(
          `badge.family_key: 계열 키 형태(${familyKey})가 올바르지 않아요. "종목:이름" 형태로, 쉼표 없이 입력해 주세요.`
        )
      }
    }
  }

  const { sort_order, point_reward, drop_weight, activity_types } = badge
  if (sort_order !== undefined && sort_order !== null && !(Number.isInteger(sort_order) && sort_order >= 0)) {
    errors.push('badge.sort_order: 0 이상의 정수여야 해요.')
  }
  if (point_reward !== undefined && point_reward !== null && !(Number.isInteger(point_reward) && point_reward >= 0)) {
    errors.push('badge.point_reward: 0 이상의 정수여야 해요.')
  }
  // DB CHECK `badges_drop_weight_positive`(마이그레이션 015)와 같은 조건이다.
  if (drop_weight !== undefined && drop_weight !== null && !(typeof drop_weight === 'number' && Number.isFinite(drop_weight) && drop_weight > 0)) {
    errors.push('badge.drop_weight: 0보다 큰 숫자여야 해요.')
  }
  if (activity_types !== undefined && activity_types !== null) {
    if (!Array.isArray(activity_types) || activity_types.some((t) => !ADMIN_ACTIVITY_TYPES.includes(t))) {
      errors.push(`badge.activity_types: ${ADMIN_ACTIVITY_TYPES.join(' · ')} 중에서 고른 배열이어야 해요.`)
    }
  }
  for (const key of ['tribe_id', 'item_book_id']) {
    const value = badge[key]
    if (value !== undefined && value !== null && !(typeof value === 'string' && UUID_PATTERN.test(value))) {
      errors.push(`badge.${key}: UUID 형식이어야 해요.`)
    }
  }
  for (const key of ['valid_from', 'valid_until']) {
    const value = badge[key]
    if (value !== undefined && value !== null && !isIsoDateTime(value)) {
      errors.push(`badge.${key}: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-10-01T00:00:00+09:00).`)
    }
  }
  if (isIsoDateTime(badge.valid_from) && isIsoDateTime(badge.valid_until) && Date.parse(badge.valid_from) >= Date.parse(badge.valid_until)) {
    errors.push('badge.valid_from: valid_until보다 앞이어야 해요.')
  }

  // 조건 저장 검증 — 라우트와 같은 진입점(`findBadgeConditionSaveError`)이다.
  const condition = badge.condition_json
  if (condition !== undefined && condition !== null && !isPlainObject(condition)) {
    errors.push('badge.condition_json: 객체(또는 null)여야 해요.')
  } else if (typeOk && isNonEmptyString(name)) {
    try {
      const conditionError = findBadgeConditionSaveError({ name, family_key: familyKey }, type, condition ?? null)
      if (conditionError) errors.push(`badge.condition_json: ${conditionError}`)
    } catch (e) {
      errors.push(`badge.condition_json: 조건을 검증하다 오류가 났어요 — ${e instanceof Error ? e.message : String(e)}`)
    }
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
  if (image.path !== undefined && image.path !== null) {
    if (!isNonEmptyString(image.path)) {
      errors.push('image.path: 비어 있지 않은 문자열이어야 해요.')
    } else {
      absPath = path.isAbsolute(image.path) ? image.path : path.resolve(path.dirname(bundleFile), image.path)
      const inspected = inspectPngFile(absPath)
      if (inspected.error) errors.push(`image.path: ${inspected.error}`)
      else bytes = inspected.bytes
    }
  }

  if (image.seed !== undefined && image.seed !== null && !Number.isSafeInteger(image.seed)) {
    errors.push(`image.seed: 정수여야 해요(받은 값: ${describeValue(image.seed)}).`)
  }
  if (image.preset_id !== undefined && image.preset_id !== null && !(typeof image.preset_id === 'string' && UUID_PATTERN.test(image.preset_id))) {
    errors.push(`image.preset_id: 프리셋 ID(UUID) 형식이 아니에요(받은 값: ${describeValue(image.preset_id)}).`)
  }
  for (const key of ['bg_color', 'end_color']) {
    const value = image[key]
    if (value !== undefined && value !== null && !(typeof value === 'string' && HEX_COLOR_PATTERN.test(value))) {
      errors.push(`image.${key}: #rrggbb 형식이어야 해요(받은 값: ${describeValue(value)}).`)
    }
  }
  if (image.text !== undefined && image.text !== null && typeof image.text !== 'string') {
    errors.push('image.text: 문자열이어야 해요.')
  }

  return { absPath, bytes }
}

/**
 * 파싱된 bundle.json을 검증한다. 고칠 수 있는 사유를 한 번에 모두 알리려고 첫 오류에서 멈추지
 * 않고 전부 모아 `errors`로 돌려준다(재사용하는 조건 검증 함수는 자체적으로 첫 오류 하나만 준다).
 *
 * 인자: `raw`는 JSON.parse 결과, `bundleFile`은 bundle.json 절대경로(이미지 상대경로의 기준)다.
 * 반환: `{ errors, bundle }` — 오류가 없으면 `bundle`에 정규화된 묶음이 담기고(`bundle.image.abs_path`
 * 이미지 절대경로·`bundle.image.bytes` 원본 크기가 추가된다), 있으면 `bundle`은 null이다.
 * (이 파일은 JSDoc 타입 주석을 쓰지 않는다 — TS 테스트가 이 .mjs를 import할 때 추론이 좁아져
 * 호출이 막히는 것을 피한다.)
 */
export function validateBundle(raw, { bundleFile }) {
  const errors = []
  if (!isPlainObject(raw)) {
    return { errors: ['묶음 파일의 최상위는 객체여야 해요.'], bundle: null }
  }

  const unknown = unknownKeys(raw, BUNDLE_TOP_REQUIRED)
  if (unknown.length > 0) {
    errors.push(`알 수 없는 최상위 필드예요 — ${unknown.join(', ')}. 지원 필드: ${BUNDLE_TOP_REQUIRED.join(', ')}`)
  }
  checkRequired(errors, '', raw, BUNDLE_TOP_REQUIRED)

  if (raw.bundle_id !== undefined && raw.bundle_id !== null) {
    if (typeof raw.bundle_id !== 'string' || !BUNDLE_ID_PATTERN.test(raw.bundle_id) || raw.bundle_id.length > 60) {
      errors.push('bundle_id: 영문 소문자·숫자와 하이픈만 쓸 수 있어요(60자 이하, 예: 2026-09-25-dawn-runner).')
    }
  }
  if (raw.author !== undefined && raw.author !== null && !isNonEmptyString(raw.author)) {
    errors.push('author: 비어 있지 않은 문자열이어야 해요.')
  }
  if (raw.created_at !== undefined && raw.created_at !== null && !isIsoDateTime(raw.created_at)) {
    errors.push(`created_at: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-09-25T10:30:00+09:00, 받은 값: ${describeValue(raw.created_at)}).`)
  }
  const link = raw.color_rationale_link
  if (link !== undefined && link !== null) {
    const linkOk = typeof link === 'string' && (/^https?:\/\/\S+$/.test(link) || /^(docs|jam-doc)\/\S.*$/.test(link))
    if (!linkOk) {
      errors.push('color_rationale_link: http(s) 주소이거나 저장소 상대 경로(docs/… 또는 jam-doc/…)여야 해요.')
    }
  }

  if (raw.badge !== undefined && raw.badge !== null) validateBadge(errors, raw.badge)
  const imageInfo = raw.image !== undefined && raw.image !== null
    ? validateImage(errors, raw.image, bundleFile)
    : { absPath: null, bytes: null }

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
 * 배지 행 insert 페이로드를 만든다 — 어드민 배지 생성 API(POST `/api/admin/badges`)의
 * `insertPayload`와 같은 매핑·기본값이다. 다른 점은 셋뿐이다.
 * - `id`: 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID를 넣는다(라우트는 DB 기본값에 맡긴다).
 * - `image_url`: 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함).
 * - `image_source`: 항상 `agent-generator`.
 * 1차 범위 밖 필드(체크인 카테고리·JAM! 분류·배경 테마 5종·패치 판매)는 라우트가 «없음»일 때 쓰는
 * 값(null/기본값)을 그대로 넣는다.
 */
export function buildBadgeInsertPayload(badge, { id, imageUrl }) {
  const {
    name,
    description,
    type,
    rarity,
    level,
    family_key,
    sort_order,
    activity_types,
    condition_json,
    tribe_id,
    item_book_id,
    drop_weight,
    valid_from,
    valid_until,
    point_reward,
  } = badge
  const familyKey = typeof family_key === 'string' && family_key.trim() ? family_key.trim() : null

  return {
    id,
    name,
    description,
    type,
    rarity: rarity || null,
    level: level === undefined || level === null || level === '' ? null : Math.trunc(Number(level)),
    family_key: familyKey,
    sort_order: Number.isFinite(Number(sort_order)) ? Math.max(0, Math.trunc(Number(sort_order))) : 0,
    image_url: imageUrl,
    image_source: AGENT_IMAGE_SOURCE,
    activity_types: activity_types ?? [],
    patch_available: false,
    patch_price_krw: null,
    condition_json: condition_json ?? null,
    tribe_id: tribe_id ?? null,
    item_book_id: item_book_id ?? null,
    category: null,
    admin_category: null,
    show_on_map: true,
    drop_weight: drop_weight ?? 1.0,
    valid_from: valid_from ?? null,
    valid_until: valid_until ?? null,
    point_reward: Math.max(0, Math.trunc(Number(point_reward) || 0)),
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    background_animation: null,
  }
}

/** 등록 기록(`registration-record.json`)이 이미 있는 묶음 폴더인지 본다 — 같은 묶음을 두 번 등록하지 않게 한다. */
export function findPreviousRecordError(recordDir) {
  const recordPath = path.join(recordDir, 'registration-record.json')
  if (fs.existsSync(recordPath)) {
    return `이미 등록한 묶음으로 보여요. 등록 기록이 있어요: ${recordPath} (되돌린 뒤 다시 등록하려면 기록 파일을 옮기거나 --record-dir을 바꿔 주세요.)`
  }
  return null
}
