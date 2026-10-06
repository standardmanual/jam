/**
 * 수정 양식의 초안 계산 (티켓 20260930_1818, 순수 함수 — 화면 `OpsItemEditForm`이 쓴다).
 *
 * 초안(`draft.values`)은 경로 → 새 값이다. 시각은 서버와 같은 UTC ISO 문자열로 들고(입력 칸에 그릴 때만 KST 「YYYY-MM-DDTHH:mm」로
 * 바꾼다), 나머지는 글자 그대로다. 바뀐 칸 계산은 서버와 같은 `computeEditDiff`를 쓰되 **칸마다 따로** 불러서, 한 칸이 틀려도
 * 다른 칸의 차이는 보이게 하고 틀린 칸에 문장을 붙인다.
 */
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { OpsEditError, computeEditDiff, isTimePath, splitEditPath, type OpsEditDiffEntry } from '@/lib/admin/opsInbox/edit'
import { validateEditedColor } from '@/lib/admin/opsInbox/validate'
import type { Json } from '@/types/database.generated'

const KST_LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** `datetime-local` 입력값(KST 「YYYY-MM-DDTHH:mm」)을 UTC ISO 문자열로. 비었으면 빈 문자열, 읽을 수 없으면 입력 그대로다. */
export function kstLocalInputToIso(local: string): string {
  if (local === '') return ''
  if (!KST_LOCAL_INPUT.test(local)) return local
  const date = new Date(`${local}:00+09:00`)
  return Number.isNaN(date.getTime()) ? local : date.toISOString()
}

export interface DraftDiff {
  /** 바뀐 칸(지금 값 → 초안 값). */
  diff: OpsEditDiffEntry[]
  /** 받을 수 없는 칸의 문장(경로 → 문장). 비어 있으면 저장할 수 있다. */
  errors: Record<string, string>
}

/** 초안과 지금 항목을 견줘 바뀐 칸과 틀린 칸을 돌려준다. */
export function computeDraftDiff(item: ViewableItem, values: Record<string, unknown>): DraftDiff {
  const diff: OpsEditDiffEntry[] = []
  const errors: Record<string, string> = {}

  for (const [path, value] of Object.entries(values)) {
    try {
      diff.push(...computeEditDiff(item, { [path]: value }))
    } catch (error) {
      if (error instanceof OpsEditError) errors[error.path] = error.message
      else throw error
    }
  }

  for (const entry of diff) {
    if (splitEditPath(entry.path)?.root !== 'colors') continue
    const message = validateEditedColor(entry.after ?? '')
    if (message) errors[entry.path] = message
  }
  return { diff, errors }
}

/**
 * 저장 전 초안 값을 덮어쓴 항목(미리보기용, 티켓 20261006_1802). 저장하지 않고 화면에서만 쓴다.
 * `copy.<키>`·`colors.<키>`는 지금 값 위에 키 단위로 덮고, 시각은 비어 있지 않은 값만 덮는다(시각 비우기는 받지 않는 칸이다).
 * 문자열이 아닌 값과 그 밖의 경로는 무시한다. 입력 항목은 바꾸지 않는다.
 */
export function applyDraftToItem(item: ViewableItem, values: Readonly<Record<string, unknown>>): ViewableItem {
  const next: Record<string, unknown> = { ...(asRecord(item.edited) ?? {}) }
  for (const [path, value] of Object.entries(values)) {
    if (typeof value !== 'string') continue
    const parts = splitEditPath(path)
    if (parts) {
      const base = asRecord(next[parts.root]) ?? asRecord(itemField(item, parts.root)) ?? {}
      next[parts.root] = { ...base, [parts.key]: value }
    } else if (isTimePath(path) && value !== '') {
      next[path] = value
    }
  }
  return { original: item.original, edited: Object.keys(next).length === 0 ? null : (next as Json) }
}

/** 서버로 보낼 값: 바뀐 칸만 경로 → 새 값이다(시각은 UTC ISO 문자열). */
export function valuesFromDiff(diff: readonly OpsEditDiffEntry[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const entry of diff) values[entry.path] = entry.after ?? ''
  return values
}

export interface SplitFieldErrors {
  /** 칸 경로에 걸린 문장. */
  byPath: Record<string, string>
  /** 문안·색 묶음 전체에 걸린 문장. */
  groups: { copy?: string; colors?: string }
  /** 어느 칸에도 붙일 수 없는 문장(그대로 아래에 모아 보여 준다). */
  other: string[]
}

/**
 * 서버(400)가 돌려준 칸별 문장을 화면 칸에 나눈다. 서버는 고친 칸의 경로(`copy.body`) 또는 그 묶음의 이름(`copy`·`colors`·
 * `starts_at`…)으로 문장을 보낸다. 칸에 붙일 곳이 없는 문장을 버리지 않고 `other`에 모은다.
 */
export function splitFieldErrors(errors: Readonly<Record<string, string>>, fieldPaths: readonly string[]): SplitFieldErrors {
  const known = new Set(fieldPaths)
  const result: SplitFieldErrors = { byPath: {}, groups: {}, other: [] }
  for (const [key, message] of Object.entries(errors)) {
    if (known.has(key)) result.byPath[key] = message
    else if (key === 'copy') result.groups.copy = message
    else if (key === 'colors') result.groups.colors = message
    else result.other.push(message)
  }
  return result
}
