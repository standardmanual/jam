/**
 * 직접 수정 계산 (티켓 20260930_1818, 순수 함수 — 서버(`decide.ts`)와 화면(수정 양식)이 함께 쓴다).
 *
 * 검토중 항목에서 고칠 수 있는 칸은 여섯 갈래다(상위 티켓 20260930_1455 가정 13).
 * - `copy.<키>`: 제출된 문안 키마다 한 칸(문자열 값만)
 * - `colors.<키>`: 제출된 색 키마다 한 칸(문자열 값만)
 * - `starts_at`·`ends_at`: 공개·종료 시각
 * - `segment`: 대상(문자열일 때만. 객체로 제출된 대상은 이 화면에서 고치지 않는다)
 * - `user_experience`: 「유저가 겪는 것」
 * 그 밖의 경로가 들어오면 거절한다. 새 키를 더할 수도 없다(이미 제출된 키의 값만 바꾼다).
 *
 * 수정본(`edited`)은 **최상위 키 덮어쓰기**다(`itemView.ts`의 `itemField`가 수정본을 먼저 읽는다). 그래서 `copy`·`colors`는
 * 합친 객체 전체를 넣고, 값이 제출 원본과 같아지면 그 키를 뺀다. 제출 원본(`original`)은 어떤 경우에도 바꾸지 않는다.
 *
 * 시각 값은 UTC ISO 문자열(`toISOString()`)로 다룬다. 비어 있으면 null이다. 수정본에서 null은 「원본을 따른다」는 뜻이라
 * (`itemField`) 시각을 비우는 수정은 받지 않는다.
 */
import type { Json } from '@/types/database.generated'
import { asRecord, itemField, type ViewableItem } from '@/lib/admin/opsInbox/itemView'
import { isIsoDateTime } from '@/lib/admin/opsInbox/validate'

export const EDIT_TIME_PATHS = ['starts_at', 'ends_at'] as const
const EDIT_SCALAR_PATHS = ['user_experience', 'segment', ...EDIT_TIME_PATHS] as const
const EDIT_OBJECT_ROOTS = ['copy', 'colors'] as const

type EditObjectRoot = (typeof EDIT_OBJECT_ROOTS)[number]

/**
 * 수정 전후 차이의 한 칸. 시각이 아닌 칸은 항상 문자열이고, 시각은 UTC ISO 문자열 또는 null(비어 있음)이다.
 * `type` 별칭으로 둔다(interface는 jsonb 열에 넣을 `Json`으로 바로 대입되지 않는다).
 */
export type OpsEditDiffEntry = {
  path: string
  before: string | null
  after: string | null
}

/** 받을 수 없는 수정 값. `path`는 문제가 된 칸이다. */
export class OpsEditError extends Error {
  readonly path: string
  constructor(message: string, path: string) {
    super(message)
    this.name = 'OpsEditError'
    this.path = path
  }
}

export function isTimePath(path: string): boolean {
  return (EDIT_TIME_PATHS as readonly string[]).includes(path)
}

/** `copy.body` → `{ root: 'copy', key: 'body' }`. 그 밖이거나 키가 비면 null. */
export function splitEditPath(path: string): { root: EditObjectRoot; key: string } | null {
  for (const root of EDIT_OBJECT_ROOTS) {
    if (path.startsWith(`${root}.`) && path.length > root.length + 1) {
      return { root, key: path.slice(root.length + 1) }
    }
  }
  return null
}

/** 고칠 수 있는 경로의 모양인지(실제로 그 칸이 있는지는 `readEditableValues`가 정한다). */
export function isEditablePath(path: string): boolean {
  return (EDIT_SCALAR_PATHS as readonly string[]).includes(path) || splitEditPath(path) !== null
}

function timeValueOf(raw: unknown): string {
  return isIsoDateTime(raw) ? new Date(raw).toISOString() : ''
}

/**
 * 지금 항목에서 고칠 수 있는 칸과 그 값(수정본이 있으면 수정본 기준). 화면 양식의 처음 값이자 차이 계산의 「전」이다.
 * 시각은 UTC ISO 문자열이고 비어 있으면 빈 문자열이다. 제출된 값이 문자열이 아닌 문안·색·대상은 이 목록에 없다(읽기 전용).
 */
export function readEditableValues(item: ViewableItem): Record<string, string> {
  const values: Record<string, string> = {}

  const experience = itemField(item, 'user_experience')
  values.user_experience = typeof experience === 'string' ? experience : ''

  const segment = itemField(item, 'segment')
  if (segment === undefined || segment === null) values.segment = ''
  else if (typeof segment === 'string') values.segment = segment

  for (const key of EDIT_TIME_PATHS) values[key] = timeValueOf(itemField(item, key))

  for (const root of EDIT_OBJECT_ROOTS) {
    const record = asRecord(itemField(item, root))
    if (!record) continue
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') values[`${root}.${key}`] = value
    }
  }
  return values
}

/**
 * 화면 양식의 값(`values`: 경로 → 새 값)과 지금 값을 견줘 바뀐 칸만 돌려준다.
 * 고칠 수 없는 경로·없는 문안/색 키·문자열이 아닌 값·읽을 수 없는 시각·시각 비우기는 `OpsEditError`다.
 */
export function computeEditDiff(item: ViewableItem, values: Record<string, unknown>): OpsEditDiffEntry[] {
  const current = readEditableValues(item)
  const diff: OpsEditDiffEntry[] = []

  for (const [path, raw] of Object.entries(values)) {
    if (!isEditablePath(path) || !Object.prototype.hasOwnProperty.call(current, path)) {
      throw new OpsEditError('고칠 수 없는 칸이에요.', path)
    }
    if (typeof raw !== 'string') throw new OpsEditError('값을 글자로 보내 주세요.', path)

    const before = current[path]
    if (isTimePath(path)) {
      const beforeTime = before === '' ? null : before
      if (raw === '') {
        if (beforeTime !== null) throw new OpsEditError('시각은 비울 수 없어요. 바꾸려면 새 시각을 골라 주세요.', path)
        continue
      }
      if (!isIsoDateTime(raw)) throw new OpsEditError('시각 형식이 올바르지 않아요.', path)
      const after = new Date(raw).toISOString()
      if (after !== beforeTime) diff.push({ path, before: beforeTime, after })
      continue
    }

    if (raw !== before) diff.push({ path, before, after: raw })
  }
  return diff
}

function shallowEqualRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key])
}

/** 시각이 아닌 칸의 새 값이 제출 원본의 값과 같은지. 원본에 값이 없고 새 값이 빈 문자열이면 같다고 본다. */
function sameAsOriginal(path: string, value: string, originalValue: unknown): boolean {
  if (isTimePath(path)) return isIsoDateTime(originalValue) && new Date(originalValue).toISOString() === value
  if (originalValue === undefined || originalValue === null) return value === ''
  return originalValue === value
}

/**
 * 차이를 적용한 새 수정본. `forward`는 「후」를, `backward`는 「전」을 쓴다. 제출 원본은 바꾸지 않고 읽기만 한다.
 * - `copy`·`colors`: 합친 객체 전체를 넣고, 제출 원본과 같아지면 그 키를 뺀다.
 * - 나머지: 값이 제출 원본과 같아지거나 null이면 그 키를 뺀다(원본을 따른다).
 * 남는 수정이 없으면 null(수정본 없음)이다.
 */
export function applyDiff(
  original: Json,
  edited: Json | null,
  diff: readonly OpsEditDiffEntry[],
  direction: 'forward' | 'backward'
): Json | null {
  const originalRecord = asRecord(original) ?? {}
  const next: Record<string, unknown> = { ...(asRecord(edited) ?? {}) }
  const touchedRoots = new Set<EditObjectRoot>()

  for (const entry of diff) {
    const value = direction === 'forward' ? entry.after : entry.before
    const parts = splitEditPath(entry.path)

    if (parts) {
      const base = asRecord(next[parts.root]) ?? asRecord(originalRecord[parts.root]) ?? {}
      next[parts.root] = { ...base, [parts.key]: value ?? '' }
      touchedRoots.add(parts.root)
      continue
    }

    if (!isEditablePath(entry.path)) continue
    if (value === null || sameAsOriginal(entry.path, value, originalRecord[entry.path])) delete next[entry.path]
    else next[entry.path] = value
  }

  for (const root of touchedRoots) {
    const merged = asRecord(next[root]) ?? {}
    if (shallowEqualRecord(merged, asRecord(originalRecord[root]) ?? {})) delete next[root]
  }

  return Object.keys(next).length === 0 ? null : (next as Json)
}

/** 검증에 쓰는 항목 한 벌: 제출 원본 위에 수정본을 최상위 키 단위로 덮은 값. */
export function mergeItemForValidation(original: Json, edited: Json | null): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(asRecord(original) ?? {}) }
  for (const [key, value] of Object.entries(asRecord(edited) ?? {})) {
    if (value !== undefined && value !== null) merged[key] = value
  }
  return merged
}

/**
 * 묶음 형식 오류 목록(「경로: 사유」)에서 한 항목의 줄만 새 결과로 바꾼다. 항목의 줄은 `items[n]`으로 시작한다.
 * 묶음 오류가 앞, 항목 오류가 자리 순인 제출 때의 배치를 그대로 지킨다(줄 사이 순서는 안정 정렬).
 */
export function replaceItemFormatErrors(all: readonly string[], position: number, next: readonly string[]): string[] {
  const ownerOf = (line: string): number => {
    const match = /^items\[(\d+)\]/.exec(line)
    return match ? Number(match[1]) : -1
  }
  const combined = [...all.filter((line) => ownerOf(line) !== position), ...next]
  return combined
    .map((line, index) => ({ line, index, owner: ownerOf(line) }))
    .sort((a, b) => a.owner - b.owner || a.index - b.index)
    .map(({ line }) => line)
}

// ── 되돌리기 ─────────────────────────────────────────────────────────────────────────────────────

/** 결정 기록의 `diff`(jsonb)를 읽는다. 모양이 틀린 줄은 버린다. */
export function readDiff(value: unknown): OpsEditDiffEntry[] {
  if (!Array.isArray(value)) return []
  const entries: OpsEditDiffEntry[] = []
  for (const raw of value) {
    const record = asRecord(raw)
    if (!record || typeof record.path !== 'string') continue
    const before = record.before
    const after = record.after
    if ((before !== null && typeof before !== 'string') || (after !== null && typeof after !== 'string')) continue
    entries.push({ path: record.path, before: before ?? null, after: after ?? null })
  }
  return entries
}

/**
 * 되돌릴 대상: 그 항목의 결정 기록을 오래된 순으로 훑어 `edit`는 쌓고 `revert`는 꺼낸다. 남은 맨 위 `edit`가 대상이다
 * (없으면 null). 한 번에 한 단계이고 다시 하기는 없다. 입력 순서는 상관없다(`createdAt`으로 정렬한다).
 */
export function findRevertTarget<T extends { action: string; createdAt: string }>(decisions: readonly T[]): T | null {
  const ordered = [...decisions].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const stack: T[] = []
  for (const decision of ordered) {
    if (decision.action === 'edit') stack.push(decision)
    else if (decision.action === 'revert') stack.pop()
  }
  return stack.length > 0 ? stack[stack.length - 1] : null
}

/**
 * 되돌림이 이번에 실제로 바꾸는 칸: 지금 값(전) → 대상 수정의 「전」 값(후). 이미 같은 칸은 뺀다.
 * 이 결과를 `applyDiff(..., 'forward')`로 적용하고 그대로 `revert` 결정 기록의 `diff`로 남긴다.
 */
export function computeRevertDiff(item: ViewableItem, targetDiff: readonly OpsEditDiffEntry[]): OpsEditDiffEntry[] {
  const current = readEditableValues(item)
  return targetDiff
    .map((entry) => {
      const now = Object.prototype.hasOwnProperty.call(current, entry.path) ? current[entry.path] : null
      return { path: entry.path, before: isTimePath(entry.path) && now === '' ? null : now, after: entry.before }
    })
    .filter((entry) => entry.before !== entry.after)
}
