/**
 * JAM! 에셋 제너레이터 홈피드 카드 등록 묶음 — 읽기·검증·카드 행 매핑 (티켓 20260925_1413)
 *
 * 등록 묶음(`bundle.json`)의 형식 정본은 `docs/specs/prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md`다.
 * 이 파일은 그 문서의 검증 규칙을 코드로 옮긴 함수 모음이다(파일 읽기는 이미지 존재·PNG 여부
 * 확인에만 쓴다). DB·저장소에는 쓰지 않는다.
 *
 * ## 카드 검사·페이로드는 `src/`에 있다 (티켓 20261002_1027)
 * 카드 한 건의 순수 검사(`validateCard`)·카드 쪽 상수·insert 페이로드 코어(`buildTodayCardInsertPayload`)는 서버(운영툴 예약
 * 등록)도 같은 함수를 쓰도록 `src/lib/admin/registerChecks/homeFeedFields.ts`로 옮겼고, 정규식·보조 함수는 같은 폴더의
 * `bundleRules.ts`에 있다. 이 파일은 그 상수를 같은 이름으로 다시 내보내고, `validateCard`를 부르며,
 * `buildTodayCardInsertPayload`를 얇은 JS 래퍼로 감싼다(TS 시그니처가 테스트의 느슨한 호출과 충돌하지 않게). 동작·오류 문장·
 * 페이로드 키 집합은 옮기기 전과 같다. 세계관 검토·이미지 검사(`validateWorldReview`·`validateImage`)와 묶음 전체 검사
 * (`validateHomeFeedBundle`)는 서버가 쓰지 않아 여기 남는다.
 *
 * ## 배지·미션 등록 모듈과의 관계 (티켓 1413 결정 기록 2)
 * 배지 5개 파일은 검증이 끝난 자산이라 **고치지 않는다.** 내용과 무관한 부품(`readBundleFile`·`findPreviousRecordError`)만
 * `registerBundle.mjs`에서 가져온다. `UUID_PATTERN`·`AGENT_IMAGE_SOURCE`와 보조 함수의 원본은 `bundleRules.ts` 한 곳이다
 * (티켓 2202·1412 게이트 교훈).
 *
 * ## 검증 규칙의 원천 (티켓 1413 결정 기록 3)
 * 어드민 `today_cards` 생성 API(`api/admin/today/route.ts` POST)는 본문을 검증 없이 insert하므로 «재사용할 검증 함수»가
 * 없다. 규칙은 어드민 폼(`TodayCardForm.tsx`의 `collectMissing`: 제목·노출 조건 태그 1개 이상·시작·종료 일시)과
 * `lib/admin/today-sections.ts`의 상수, DB CHECK 제약(마이그레이션 048·049·158·183·190)에 있다. 허용값 목록은
 * `today-sections.ts` 상수에서 뽑는다(목록이 갈라지지 않게 — `registerHomeFeedBundle.test.ts`가 DB CHECK 마이그레이션과도 대조한다).
 *
 * insert 페이로드 기준은 `src/types/database.generated.ts`의 today_cards Insert 타입이다. 컬럼 목록이 어긋나면
 * 테스트("생성 타입 컬럼 대조")가 실패한다.
 */
import fs from 'node:fs'
import path from 'node:path'

import { MAX_APPLY_IMAGE_BYTES } from '../../src/lib/admin/applyGeneratedImageConstants'
import {
  UUID_PATTERN,
  checkRequired,
  describeValue,
  isIsoDateTime,
  isNonEmptyString,
  isPlainObject,
  isPresent,
  unknownKeys,
  visibleLength,
} from '../../src/lib/admin/registerChecks/bundleRules'
import {
  CARD_OPTIONAL_FIELDS,
  CARD_REQUIRED_FIELDS,
  CONTENT_TYPE_IDS,
  EXPOSURE_TAGS,
  LAYOUT_TYPES,
  REQUIRED_REFERENCE_FIELDS,
  TEMPLATE_FIELD_KEY,
  TEMPLATE_TYPES,
  buildTodayCardInsertPayload as buildTodayCardInsertPayloadImpl,
  checkOneLine,
  validateCard,
} from '../../src/lib/admin/registerChecks/homeFeedFields'

export { AGENT_IMAGE_SOURCE, UUID_PATTERN, findPreviousRecordError, readBundleFile } from './registerBundle.mjs'

// 카드 쪽 상수의 원본은 `homeFeedFields.ts`다 — 지금까지 이 파일이 내보내던 이름 그대로 다시 내보낸다.
export {
  CARD_REQUIRED_FIELDS,
  CARD_OPTIONAL_FIELDS,
  TEMPLATE_TYPES,
  LAYOUT_TYPES,
  EXPOSURE_TAGS,
  CONTENT_TYPE_IDS,
  TEMPLATE_FIELD_KEY,
  REQUIRED_REFERENCE_FIELDS,
}

export const BUNDLE_TOP_REQUIRED = ['bundle_id', 'author', 'created_at', 'color_rationale_link', 'world_review', 'card', 'image']
export const WORLD_REVIEW_FIELDS = ['world_related', 'winter_reviewed', 'reason']
export const IMAGE_REQUIRED_FIELDS = ['path', 'seed', 'preset_id', 'bg_color', 'end_color']
export const IMAGE_OPTIONAL_FIELDS = ['text', 'subtext']

const BUNDLE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// 홈피드 프리셋 글자 수 가이드(asset-generator/PRD.md §8 실측) — 공백 포함 «보이는 글자(코드 포인트) 수» 기준.
const TITLE_MAX_CHARS = 11
const SUBTEXT_ONE_LINE_MAX_CHARS = 22
const SUBTEXT_TWO_LINE_MAX_CHARS_PER_LINE = 15

/**
 * 줄 구분 기준으로 나눈다. 리터럴 `\n`(백슬래시+n 두 글자, 렌더 인자에서 실제 개행으로 바뀐다 — `renderArgs.mjs` 43행)과
 * 실제 개행 문자를 둘 다 줄 구분자로 본다(묶음 값이 둘 중 어느 쪽으로 들어와도 같게 취급).
 */
function splitDisplayLines(value) {
  return value.replace(/\\n/g, '\n').split('\n')
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
  } else if (isPresent(image.text)) {
    // 홈피드 프리셋 글자 수 가이드(asset-generator/PRD.md §8) — 제목은 줄바꿈 없이 한 줄, 공백 포함 11자 이하.
    const lines = splitDisplayLines(image.text)
    if (lines.length > 1) {
      errors.push('image.text: 제목은 줄바꿈 없이 한 줄이어야 해요(홈피드 프리셋 글자 수 가이드, asset-generator/PRD.md §8).')
    } else if (visibleLength(image.text) > TITLE_MAX_CHARS) {
      errors.push(
        `image.text: 홈피드 프리셋 글자 수 가이드를 넘어요 — 제목은 공백 포함 ${TITLE_MAX_CHARS}자 이하여야 해요(받은 글자 수: ${visibleLength(image.text)}, asset-generator/PRD.md §8).`
      )
    }
  }
  if (isPresent(image.subtext) && typeof image.subtext !== 'string') {
    errors.push('image.subtext: 문자열이어야 해요.')
  } else if (isPresent(image.subtext)) {
    // 홈피드 프리셋 글자 수 가이드(asset-generator/PRD.md §8) — 1줄이면 22자, 2줄이면 줄마다 15자, 3줄 이상은 거절.
    const lines = splitDisplayLines(image.subtext)
    if (lines.length === 1) {
      if (visibleLength(lines[0]) > SUBTEXT_ONE_LINE_MAX_CHARS) {
        errors.push(
          `image.subtext: 홈피드 프리셋 글자 수 가이드를 넘어요 — 1줄이면 공백 포함 ${SUBTEXT_ONE_LINE_MAX_CHARS}자 이하여야 해요(받은 글자 수: ${visibleLength(lines[0])}, asset-generator/PRD.md §8).`
        )
      }
    } else if (lines.length === 2) {
      const lengths = lines.map(visibleLength)
      if (lengths.some((len) => len > SUBTEXT_TWO_LINE_MAX_CHARS_PER_LINE)) {
        errors.push(
          `image.subtext: 홈피드 프리셋 글자 수 가이드를 넘어요 — 2줄이면 줄마다 공백 포함 ${SUBTEXT_TWO_LINE_MAX_CHARS_PER_LINE}자 이하여야 해요(받은 줄 글자 수: ${lengths.join(' · ')}, asset-generator/PRD.md §8).`
        )
      }
    } else {
      errors.push('image.subtext: 3줄 이상은 쓸 수 없어요(가능하면 1줄, 부득이할 때만 2줄로 나눠 주세요, asset-generator/PRD.md §8).')
    }
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
 * 홈피드 카드 행 insert 페이로드를 만든다. 값 매핑 본문과 설명(어드민 폼과 같은 값 모양, `id`·`cover_image_url`·`image_source`·
 * `shape`·`title_in_image`가 다른 점)은 `src/lib/admin/registerChecks/homeFeedFields.ts`의 `buildTodayCardInsertPayload`에 있다
 * (티켓 20261002_1027). TS 함수를 그대로 다시 내보내지 않고 JS 래퍼를 두는 이유: 테스트의 호출이 TS 시그니처로 typecheck되면
 * 느슨한 입력(`Record<string, unknown>`)이 통과하지 못한다. 선택 인자는 넘기지 않는다 — 스크립트 등록은 `image_source`가 항상
 * `agent-generator`이고 `shape`·`title_in_image`는 NULL이다.
 */
export function buildTodayCardInsertPayload(card, { id, coverImageUrl }) {
  return buildTodayCardInsertPayloadImpl(card, { id, coverImageUrl })
}
