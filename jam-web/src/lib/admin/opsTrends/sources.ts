/**
 * 트렌드 출처 등록·수정 본문 검증 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4). 순수 함수만 둔다.
 *
 * - `validateTrendSourceCreate`: `name`·`kind`·`location`. 앞뒤 공백을 떼고 종류·길이를 검사한다.
 *   직접 올린 자료가 아닌 종류는 `location`이 비면 오류다. 저장소 폴더 종류는 위치가 허용 폴더 목록에 있어야 한다.
 * - `validateTrendSourcePatch`: `enabled`·`name`·`location` 중 하나 이상. 같은 검사를 한다(`kind`는 바꿀 수 없다).
 *   패치에는 종류가 없으므로 「종류별 위치 필수」와 「저장소 폴더의 허용 폴더 검사」는 저장소(`sourceStore.ts`)가
 *   현재 행의 종류로 마지막에 확인한다.
 */
import {
  OPS_TREND_SOURCE_FOLDERS,
  OPS_TREND_SOURCE_KINDS,
  OPS_TREND_SOURCE_MAX_LOCATION,
  OPS_TREND_SOURCE_MAX_NAME,
  type OpsTrendSourceKind,
} from '@/lib/admin/opsTrends/constants'

export interface TrendSourceCreateInput {
  name: string
  kind: OpsTrendSourceKind
  location: string
}

export interface TrendSourcePatchInput {
  enabled?: boolean
  name?: string
  location?: string
}

export type TrendSourceValidation<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// 이름·위치가 로그와 화면에서 줄을 깨지 않게 한다.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null
}

function isKind(value: unknown): value is OpsTrendSourceKind {
  return typeof value === 'string' && (OPS_TREND_SOURCE_KINDS as readonly string[]).includes(value)
}

/** 위치가 허용 폴더 목록(`OPS_TREND_SOURCE_FOLDERS`)에 글자 그대로 있는지. 저장소 폴더 종류의 등록·수정이 함께 쓴다. */
export function isTrendSourceFolder(value: string): boolean {
  return (OPS_TREND_SOURCE_FOLDERS as readonly string[]).includes(value)
}

export const TREND_SOURCE_FOLDER_ERROR = 'location: 정해 둔 폴더 중에서 골라 주세요.'

function checkName(value: unknown, errors: string[]): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push('name: 비어 있지 않은 문자열이어야 해요.')
    return null
  }
  if (CONTROL_OR_LINE_BREAK.test(value)) {
    errors.push('name: 줄바꿈이나 제어 문자를 넣을 수 없어요.')
    return null
  }
  const name = value.trim()
  if (name.length > OPS_TREND_SOURCE_MAX_NAME) {
    errors.push(`name: ${OPS_TREND_SOURCE_MAX_NAME}자까지 받아요(받은 길이: ${name.length}자).`)
    return null
  }
  return name
}

function checkLocation(value: unknown, errors: string[]): string | null {
  if (typeof value !== 'string') {
    errors.push('location: 문자열이어야 해요.')
    return null
  }
  if (CONTROL_OR_LINE_BREAK.test(value)) {
    errors.push('location: 줄바꿈이나 제어 문자를 넣을 수 없어요.')
    return null
  }
  const location = value.trim()
  if (location.length > OPS_TREND_SOURCE_MAX_LOCATION) {
    errors.push(`location: ${OPS_TREND_SOURCE_MAX_LOCATION}자까지 받아요(받은 길이: ${location.length}자).`)
    return null
  }
  return location
}

/** 출처 등록 본문 검증. 하나라도 틀리면 저장하지 않는다. */
export function validateTrendSourceCreate(raw: unknown): TrendSourceValidation<TrendSourceCreateInput> {
  if (!isPlainObject(raw)) return { ok: false, errors: ['본문: 객체여야 해요.'] }
  const errors: string[] = []

  const name = checkName(raw.name, errors)

  let kind: OpsTrendSourceKind | null = null
  if (!isKind(raw.kind)) {
    errors.push(`kind: ${OPS_TREND_SOURCE_KINDS.join(' · ')} 중 하나여야 해요.`)
  } else {
    kind = raw.kind
  }

  let location = ''
  let locationInvalid = false
  if (isPresent(raw.location)) {
    const checked = checkLocation(raw.location, errors)
    if (checked === null) locationInvalid = true
    else location = checked
  }
  if (kind === 'repo_folder') {
    // 비어 있거나 목록 밖이면 같은 문장 하나로 알린다(길이·제어 문자 오류가 이미 있으면 겹쳐 내지 않는다).
    if (!locationInvalid && !isTrendSourceFolder(location)) errors.push(TREND_SOURCE_FOLDER_ERROR)
  } else if (kind !== null && kind !== 'manual_upload' && location.length === 0 && !locationInvalid) {
    errors.push('location: 직접 올린 자료가 아닌 종류는 주소·해시태그·검색어를 적어야 해요.')
  }

  if (errors.length > 0 || name === null || kind === null) return { ok: false, errors }
  return { ok: true, value: { name, kind, location } }
}

/** 출처 수정 본문 검증. `enabled`·`name`·`location` 중 하나 이상이 있어야 한다. */
export function validateTrendSourcePatch(raw: unknown): TrendSourceValidation<TrendSourcePatchInput> {
  if (!isPlainObject(raw)) return { ok: false, errors: ['본문: 객체여야 해요.'] }
  const errors: string[] = []
  const value: TrendSourcePatchInput = {}

  if (isPresent(raw.enabled)) {
    if (typeof raw.enabled !== 'boolean') errors.push('enabled: true 또는 false여야 해요.')
    else value.enabled = raw.enabled
  }
  if (isPresent(raw.name)) {
    const name = checkName(raw.name, errors)
    if (name !== null) value.name = name
  }
  if (isPresent(raw.location)) {
    const location = checkLocation(raw.location, errors)
    if (location !== null) value.location = location
  }

  if (errors.length === 0 && Object.keys(value).length === 0) {
    errors.push('본문: enabled, name, location 중 하나 이상을 보내 주세요.')
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value }
}
