/**
 * JAM! 에셋 제너레이터 미션 등록 묶음 — 읽기·검증·미션 행 매핑 (티켓 20260925_1412)
 *
 * 등록 묶음(`bundle.json`)의 형식 정본은 `docs/specs/prd/asset-generator/MISSION_REGISTRATION_BUNDLE.md`다.
 * 이 파일은 그 문서의 검증 규칙을 코드로 옮긴 순수 함수 모음이다(파일 읽기는 이미지 존재·PNG 여부
 * 확인에만 쓴다). DB·저장소에는 쓰지 않는다.
 *
 * ## 배지 등록 모듈과의 관계 (티켓 1412 결정 기록 2)
 * 배지 등록 스크립트(`registerBundle.mjs` 등 5개 파일)는 티켓 2202로 실제 등록·되돌림까지 검증된
 * 자산이라 **고치지 않는다.** 내용과 무관한 부품(`readBundleFile`·`findPreviousRecordError`·
 * `UUID_PATTERN`·`AGENT_IMAGE_SOURCE`)만 그 모듈에서 가져오고, 배지 전용으로 묶여 있는 이미지 검증·
 * 문자열 검사는 이 파일에 미션용으로 다시 적었다(비공개 함수라 가져올 수 없다). 세 유형(배지·미션·
 * 홈피드)이 모두 생긴 뒤 공통화가 필요하면 별도 티켓으로 다룬다.
 *
 * ## 어드민 미션 생성 API와 같은 규칙
 * 미션 행 생성 규칙은 어드민 API(`jam-web/src/app/api/admin/missions/route.ts` POST)와 같아야 한다.
 * 그래서 검증 3종을 **재사용한다**(복사하지 않는다), 라우트와 같은 호출 순서(키 → 값 → 게이트)로:
 * `checkMissionCondition`·`checkMissionConditionValue`(`lib/missions/condition-keys`),
 * `findGateMissionSaveError`(`lib/missions/gateMissions`). 이 함수들이 내부에서 `@/` 별칭을 쓰므로
 * 이 파일을 불러오는 스크립트는 **cwd가 `jam-web`인 tsx**로 실행해야 한다(`register-badge.mjs` 머리말).
 *
 * insert 페이로드는 라우트가 요청 body를 그대로 넘기는 구조(`insert(body)`)라 매핑 함수가 없다.
 * 기준은 `src/types/database.generated.ts`의 missions Insert 타입이며, 컬럼 목록이 어긋나면 테스트
 * (`registerMissionBundle.test.ts`의 "생성 타입 컬럼 대조")가 실패한다.
 */
import fs from 'node:fs'
import path from 'node:path'

import { checkMissionCondition, checkMissionConditionValue } from '../../src/lib/missions/condition-keys'
import { findGateMissionSaveError } from '../../src/lib/missions/gateMissions'
import { MISSION_TYPES } from '../../src/lib/admin/badge-labels'
import { MAX_APPLY_IMAGE_BYTES } from '../../src/lib/admin/applyGeneratedImageConstants'
import { AGENT_IMAGE_SOURCE, UUID_PATTERN } from './registerBundle.mjs'

export { AGENT_IMAGE_SOURCE, UUID_PATTERN, findPreviousRecordError, readBundleFile } from './registerBundle.mjs'

export const BUNDLE_TOP_REQUIRED = ['bundle_id', 'author', 'created_at', 'color_rationale_link', 'world_review', 'mission', 'image']
export const MISSION_REQUIRED_FIELDS = ['title', 'description', 'mission_type', 'condition_json', 'starts_at']
export const MISSION_OPTIONAL_FIELDS = [
  'ends_at',
  'reward_points',
  'reward_badge_ids',
  'status_display_type',
  'visible_rank_count',
  'max_completions',
  'gate_axis',
  'gate_stage',
  'visibility_rule_json',
  'exposure_mode',
  'exposure_at',
]
export const WORLD_REVIEW_FIELDS = ['world_related', 'winter_reviewed', 'reason']
export const IMAGE_REQUIRED_FIELDS = ['path', 'seed', 'preset_id', 'bg_color', 'end_color']
export const IMAGE_OPTIONAL_FIELDS = ['text']

export const STATUS_DISPLAY_TYPES = ['ranking', 'achievement', 'individual']
export const EXPOSURE_MODES = ['hidden', 'start_date', 'scheduled']

const BUNDLE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// 한 줄 텍스트(작성자·미션 제목) 검사. 이 값들은 등록 기록 SQL(registration.sql)의 `--` 주석에도 들어가고 그 파일은
// 마이그레이션 폴더에 커밋되어 다시 실행될 수 있다. 줄바꿈이 섞이면 뒷부분이 주석 밖의 실행 가능한 문장이 되므로
// (티켓 20260924_2202 게이트 재현) 개행·제어 문자를 검증에서 거절한다.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/

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

/** 어드민 검증 함수 결과(`{ error, warning }`)를 묶음 오류·주의 목록에 옮긴다. */
function collectCheck(errors, warnings, prefix, check) {
  if (check.error) errors.push(`${prefix}${check.error}`)
  if (check.warning) warnings.push(`${prefix}${check.warning}`)
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
  if (isPresent(review.reason)) {
    if (!isNonEmptyString(review.reason)) errors.push('world_review.reason: 비어 있지 않은 문자열이어야 해요.')
    else if (hasControlOrLineBreak(review.reason)) {
      errors.push('world_review.reason: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).')
    }
  }
  // 세계관 내용이 있으면 윈터 검수를 거쳐야 한다(상위 티켓 1404 결정 6·11). 순수 운영성이면 검수 없이 진행하되 사유를 남긴다.
  if (review.world_related === true && review.winter_reviewed === false) {
    errors.push('world_review.winter_reviewed: 세계관과 닿는 미션(world_related=true)은 윈터 검수를 거쳐야 해서 true여야 해요.')
  }
}

function validateMission(errors, warnings, mission) {
  const prefix = 'mission.'
  if (!isPlainObject(mission)) {
    errors.push('mission: 객체여야 해요.')
    return
  }

  const supportedKeys = [...MISSION_REQUIRED_FIELDS, ...MISSION_OPTIONAL_FIELDS]
  const unknown = unknownKeys(mission, supportedKeys)
  if (unknown.length > 0) {
    errors.push(`mission: 묶음이 지원하지 않는 필드예요 — ${unknown.join(', ')}. 지원 필드: ${supportedKeys.join(', ')}`)
  }
  checkRequired(errors, prefix, mission, MISSION_REQUIRED_FIELDS)

  const { title, description, mission_type, condition_json } = mission
  if (isPresent(title) && !isNonEmptyString(title)) {
    errors.push('mission.title: 비어 있지 않은 문자열이어야 해요.')
  } else if (hasControlOrLineBreak(title)) {
    errors.push('mission.title: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).')
  }
  if (isPresent(description) && !isNonEmptyString(description)) {
    errors.push('mission.description: 비어 있지 않은 문자열이어야 해요.')
  }

  let typeOk = false
  if (isPresent(mission_type)) {
    if (typeof mission_type !== 'string' || !MISSION_TYPES.includes(mission_type)) {
      errors.push(`mission.mission_type: ${MISSION_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(mission_type)}).`)
    } else {
      typeOk = true
    }
  }

  // 조건 검증 — 어드민 API와 같은 함수·같은 순서(키 → 값). 라우트는 형태(객체) 검사도 `checkMissionCondition`에 맡긴다.
  if (isPresent(condition_json) && !isPlainObject(condition_json)) {
    errors.push('mission.condition_json: 객체여야 해요.')
  } else if (typeOk && isPresent(condition_json)) {
    try {
      const keyCheck = checkMissionCondition(mission_type, condition_json)
      collectCheck(errors, warnings, 'mission.condition_json: ', keyCheck)
      if (!keyCheck.error) {
        collectCheck(errors, warnings, 'mission.condition_json: ', checkMissionConditionValue(mission_type, condition_json))
      }
    } catch (e) {
      errors.push(`mission.condition_json: 조건을 검증하다 오류가 났어요 — ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 기간
  for (const key of ['starts_at', 'ends_at', 'exposure_at']) {
    if (isPresent(mission[key]) && !isIsoDateTime(mission[key])) {
      errors.push(`mission.${key}: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-10-01T00:00:00+09:00).`)
    }
  }
  if (isIsoDateTime(mission.starts_at) && isIsoDateTime(mission.ends_at) && Date.parse(mission.starts_at) >= Date.parse(mission.ends_at)) {
    errors.push('mission.starts_at: ends_at보다 앞이어야 해요.')
  }

  // 노출 모드 — exposure_at은 scheduled일 때만 쓰이고(마이그레이션 163), 그때는 필수다.
  const exposureMode = mission.exposure_mode
  if (isPresent(exposureMode) && !EXPOSURE_MODES.includes(exposureMode)) {
    errors.push(`mission.exposure_mode: ${EXPOSURE_MODES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(exposureMode)}).`)
  } else {
    if (exposureMode === 'scheduled' && !isPresent(mission.exposure_at)) {
      errors.push('mission.exposure_at: exposure_mode가 scheduled면 노출 시각이 필요해요.')
    }
    if (exposureMode !== 'scheduled' && isPresent(mission.exposure_at)) {
      errors.push('mission.exposure_at: exposure_mode가 scheduled일 때만 쓸 수 있어요(그 외 모드에서는 무시돼요).')
    }
  }

  // 표시·보상·횟수
  if (isPresent(mission.status_display_type) && !STATUS_DISPLAY_TYPES.includes(mission.status_display_type)) {
    errors.push(`mission.status_display_type: ${STATUS_DISPLAY_TYPES.join(' · ')} 중 하나여야 해요(받은 값: ${describeValue(mission.status_display_type)}).`)
  }
  for (const key of ['visible_rank_count', 'max_completions']) {
    const value = mission[key]
    if (isPresent(value) && !(Number.isInteger(value) && value >= 1)) {
      errors.push(`mission.${key}: 1 이상의 정수여야 해요.`)
    }
  }
  if (isPresent(mission.reward_points) && !(Number.isInteger(mission.reward_points) && mission.reward_points >= 0)) {
    errors.push('mission.reward_points: 0 이상의 정수여야 해요.')
  }
  if (isPresent(mission.reward_badge_ids)) {
    const ids = mission.reward_badge_ids
    if (!Array.isArray(ids) || ids.some((id) => !(typeof id === 'string' && UUID_PATTERN.test(id)))) {
      errors.push('mission.reward_badge_ids: 배지 ID(UUID) 문자열의 배열이어야 해요.')
    } else if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
      errors.push('mission.reward_badge_ids: 같은 배지를 두 번 넣을 수 없어요.')
    }
  }

  // 게이트 필드 — 라우트와 같은 진입점. 레거시 게이트 배지(`gated_badge_id`)는 묶음이 받지 않으므로 null로 넘긴다.
  try {
    const gateError = findGateMissionSaveError({
      gate_axis: mission.gate_axis,
      gate_stage: mission.gate_stage,
      visibility_rule_json: mission.visibility_rule_json,
      gated_badge_id: null,
    })
    if (gateError) errors.push(`mission.gate: ${gateError}`)
  } catch (e) {
    errors.push(`mission.gate: 게이트 필드를 검증하다 오류가 났어요 — ${e instanceof Error ? e.message : String(e)}`)
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

  return { absPath, bytes }
}

/**
 * 파싱된 bundle.json을 검증한다. 고칠 수 있는 사유를 한 번에 모두 알리려고 첫 오류에서 멈추지 않고 전부
 * 모아 `errors`로 돌려준다(재사용하는 조건 검증 함수는 자체적으로 첫 오류 하나만 준다). 저장은 되지만
 * 판정에 영향이 없는 조건 필드 같은 고지는 `warnings`로 따로 준다(어드민 라우트가 버리는 값이라 등록을
 * 막지는 않고, dry-run 요약에서 보여 준다).
 *
 * 인자: `raw`는 JSON.parse 결과, `bundleFile`은 bundle.json 절대경로(이미지 상대경로의 기준)다.
 * 반환: `{ errors, warnings, bundle }` — 오류가 없으면 `bundle`에 정규화된 묶음이 담기고
 * (`bundle.image.abs_path` 이미지 절대경로·`bundle.image.bytes` 원본 크기가 추가된다), 있으면 null이다.
 * (이 파일은 JSDoc 타입 주석을 쓰지 않는다 — TS 테스트가 이 .mjs를 import할 때 추론이 좁아져 호출이
 * 막히는 것을 피한다.)
 */
export function validateMissionBundle(raw, { bundleFile }) {
  const errors = []
  const warnings = []
  if (!isPlainObject(raw)) {
    return { errors: ['묶음 파일의 최상위는 객체여야 해요.'], warnings, bundle: null }
  }

  const unknown = unknownKeys(raw, BUNDLE_TOP_REQUIRED)
  if (unknown.length > 0) {
    errors.push(`알 수 없는 최상위 필드예요 — ${unknown.join(', ')}. 지원 필드: ${BUNDLE_TOP_REQUIRED.join(', ')}`)
  }
  checkRequired(errors, '', raw, BUNDLE_TOP_REQUIRED)

  if (isPresent(raw.bundle_id)) {
    if (typeof raw.bundle_id !== 'string' || !BUNDLE_ID_PATTERN.test(raw.bundle_id) || raw.bundle_id.length > 60) {
      errors.push('bundle_id: 영문 소문자·숫자와 하이픈만 쓸 수 있어요(60자 이하, 예: 2026-09-25-weekend-long-run).')
    }
  }
  if (isPresent(raw.author) && !isNonEmptyString(raw.author)) {
    errors.push('author: 비어 있지 않은 문자열이어야 해요.')
  } else if (hasControlOrLineBreak(raw.author)) {
    errors.push('author: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).')
  }
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
  if (isPresent(raw.mission)) validateMission(errors, warnings, raw.mission)
  const imageInfo = isPresent(raw.image) ? validateImage(errors, raw.image, bundleFile) : { absPath: null, bytes: null }

  if (errors.length > 0) return { errors, warnings, bundle: null }

  return {
    errors,
    warnings,
    bundle: {
      ...raw,
      image: { ...raw.image, abs_path: imageInfo.absPath, bytes: imageInfo.bytes },
    },
  }
}

/**
 * 미션 행 insert 페이로드를 만든다. 어드민 미션 생성 API(POST `/api/admin/missions`)는 body를 그대로
 * `insert`하므로 매핑이 없다 — 여기서는 어드민 폼이 «값 없음»일 때 남는 DB 기본값을 명시해서 등록 기록 SQL이
 * 실제로 들어간 값을 그대로 보여 주게 했다. 다른 점은 셋뿐이다.
 * - `id`: 이미지 저장 경로에 쓰려고 등록 전에 정한 UUID를 넣는다(라우트는 DB 기본값에 맡긴다).
 * - `image_url`: 업로드한 WebP 공개 주소(`?v=` 캐시 무효화 쿼리 포함).
 * - `image_source`: 항상 `agent-generator`(묶음 값은 받지 않는다).
 * 폐기 예정 필드(`reward_type`·`reward_id`·`gated_badge_id`)는 항상 null이다. `created_at`은 DB 기본값에 맡긴다.
 */
export function buildMissionInsertPayload(mission, { id, imageUrl }) {
  return {
    id,
    title: mission.title,
    description: mission.description,
    mission_type: mission.mission_type,
    condition_json: mission.condition_json,
    reward_type: null,
    reward_id: null,
    reward_points: mission.reward_points ?? null,
    reward_badge_ids: mission.reward_badge_ids ?? [],
    status_display_type: mission.status_display_type ?? 'ranking',
    visible_rank_count: mission.visible_rank_count ?? null,
    starts_at: mission.starts_at,
    ends_at: mission.ends_at ?? null,
    max_completions: mission.max_completions ?? null,
    image_url: imageUrl,
    image_source: AGENT_IMAGE_SOURCE,
    gated_badge_id: null,
    gate_axis: mission.gate_axis ?? null,
    gate_stage: mission.gate_stage ?? null,
    visibility_rule_json: mission.visibility_rule_json ?? null,
    exposure_mode: mission.exposure_mode ?? 'start_date',
    exposure_at: mission.exposure_at ?? null,
  }
}
