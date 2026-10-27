/**
 * 개발 요청 생성·수정 본문 검증 (티켓 20261026_2027 1회차, 어드민 상황판 PRD §8). 순수 함수만 둔다.
 *
 * - `validateDevRequestCreate`: `title`·`detail?`·`origin`·`policyId?`. 앞뒤 공백을 떼고 길이·허용값을 검사한다.
 * - `validateDevRequestPatch`: `status`는 `requested`·`dismissed`만 받는다(`ticketed`와 `ticketId`는 카리나가 SQL로 정한다).
 *   하나 이상 있어야 한다. 지금은 `status` 하나뿐이다.
 */
import {
  DEV_REQUEST_MAX_DETAIL,
  DEV_REQUEST_MAX_POLICY_ID,
  DEV_REQUEST_MAX_TITLE,
  DEV_REQUEST_ORIGINS,
  type DevRequestOrigin,
} from '@/lib/admin/devRequests/constants'

export interface DevRequestCreateInput {
  title: string
  detail: string
  origin: DevRequestOrigin
  policyId: string | null
}

export interface DevRequestPatchInput {
  status?: 'requested' | 'dismissed'
}

export type DevRequestValidation<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// 제목·정책 ID가 로그와 화면에서 줄을 깨지 않게 한다.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/
// 내용은 줄바꿈(\n, \r, \t)을 허용하고 나머지 제어 문자만 막는다.
const CONTROL_EXCEPT_WHITESPACE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null
}

function isOrigin(value: unknown): value is DevRequestOrigin {
  return typeof value === 'string' && (DEV_REQUEST_ORIGINS as readonly string[]).includes(value)
}

/** 개발 요청 생성 본문 검증. 하나라도 틀리면 저장하지 않는다. */
export function validateDevRequestCreate(raw: unknown): DevRequestValidation<DevRequestCreateInput> {
  if (!isPlainObject(raw)) return { ok: false, errors: ['본문: 객체여야 해요.'] }
  const errors: string[] = []

  let title: string | null = null
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) {
    errors.push('title: 비어 있지 않은 문자열이어야 해요.')
  } else if (CONTROL_OR_LINE_BREAK.test(raw.title)) {
    errors.push('title: 줄바꿈이나 제어 문자를 넣을 수 없어요.')
  } else if (raw.title.trim().length > DEV_REQUEST_MAX_TITLE) {
    errors.push(`title: ${DEV_REQUEST_MAX_TITLE}자까지 받아요(받은 길이: ${raw.title.trim().length}자).`)
  } else {
    title = raw.title.trim()
  }

  let detail = ''
  let detailInvalid = false
  if (isPresent(raw.detail)) {
    if (typeof raw.detail !== 'string') {
      errors.push('detail: 문자열이어야 해요.')
      detailInvalid = true
    } else if (CONTROL_EXCEPT_WHITESPACE.test(raw.detail)) {
      errors.push('detail: 제어 문자를 넣을 수 없어요.')
      detailInvalid = true
    } else if (raw.detail.trim().length > DEV_REQUEST_MAX_DETAIL) {
      errors.push(`detail: ${DEV_REQUEST_MAX_DETAIL}자까지 받아요(받은 길이: ${raw.detail.trim().length}자).`)
      detailInvalid = true
    } else {
      detail = raw.detail.trim()
    }
  }

  let origin: DevRequestOrigin | null = null
  if (!isOrigin(raw.origin)) {
    errors.push(`origin: ${DEV_REQUEST_ORIGINS.join(' · ')} 중 하나여야 해요.`)
  } else {
    origin = raw.origin
  }

  let policyId: string | null = null
  if (isPresent(raw.policyId)) {
    if (typeof raw.policyId !== 'string') {
      errors.push('policyId: 문자열이어야 해요.')
    } else if (CONTROL_OR_LINE_BREAK.test(raw.policyId)) {
      errors.push('policyId: 줄바꿈이나 제어 문자를 넣을 수 없어요.')
    } else if (raw.policyId.trim().length > DEV_REQUEST_MAX_POLICY_ID) {
      errors.push(`policyId: ${DEV_REQUEST_MAX_POLICY_ID}자까지 받아요(받은 길이: ${raw.policyId.trim().length}자).`)
    } else {
      // 빈 문자열은 「정책 없음」으로 본다.
      policyId = raw.policyId.trim() === '' ? null : raw.policyId.trim()
    }
  }

  if (errors.length > 0 || title === null || origin === null || detailInvalid) return { ok: false, errors }
  return { ok: true, value: { title, detail, origin, policyId } }
}

/** 개발 요청 수정 본문 검증. `status`가 있어야 한다. */
export function validateDevRequestPatch(raw: unknown): DevRequestValidation<DevRequestPatchInput> {
  if (!isPlainObject(raw)) return { ok: false, errors: ['본문: 객체여야 해요.'] }
  const errors: string[] = []
  const value: DevRequestPatchInput = {}

  if (isPresent(raw.status)) {
    if (raw.status !== 'requested' && raw.status !== 'dismissed') {
      errors.push('status: requested 또는 dismissed여야 해요. 티켓으로 바꾸는 일은 개발자가 따로 처리해요.')
    } else {
      value.status = raw.status
    }
  }

  if (errors.length === 0 && Object.keys(value).length === 0) {
    errors.push('본문: status를 보내 주세요.')
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value }
}
