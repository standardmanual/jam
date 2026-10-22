/**
 * 밸런스 설정 변경 이력 (티켓 20261022_1132, 마이그레이션 285 `balance_setting_changes`)
 *
 * 저장 한 번에 한 줄을 쓰고(`writeBalanceHistory`), 구역마다 최근 N건을 읽는다(`listBalanceHistory`). 설정 표에는 트리거를 달지 않고
 * 저장 경로(`save.ts`)가 이 표에 쓴다. 서비스 클라이언트는 인자로 받는다(시험은 가짜를 넘긴다).
 *
 * **바꾼 사람은 표시 이름(username)만** 싣는다. 어드민 ID와 이메일은 읽기 결과에 넣지 않는다(`ops_rules` 저장 선례와 같은 원칙).
 */
import type { Json } from '@/types/database.generated'
import type { BalanceChange, BalanceServiceClient } from './types'

const LOG = '[admin/balance]'

/** 변경 메모의 글자 수 상한 — DB CHECK(`char_length(note) <= 200`)와 같다. */
export const NOTE_MAX_LENGTH = 200

/** 변경 메모 입력의 이름표와 안내. 구역 폼과 확률 확인창이 같은 문장을 쓴다. */
export const NOTE_LABEL = '변경 메모 (선택)'
export const NOTE_PLACEHOLDER = '왜 바꾸는지 적어 두면 최근 변경에 함께 남아요'

/** 구역 화면이 보이는 최근 변경 건수. */
export const HISTORY_DEFAULT_LIMIT = 10

/** 바꾼 사람 이름을 알 수 없을 때(어드민 계정이 지워졌거나 이름이 없다). */
export const UNKNOWN_ACTOR_LABEL = '알 수 없음'

export interface BalanceHistoryEntry {
  id: string
  sectionKey: string
  changes: BalanceChange[]
  note: string | null
  affectsDisclosure: boolean
  /** 바꾼 어드민의 표시 이름. 알 수 없으면 `null`. ID·이메일은 싣지 않는다. */
  changedByName: string | null
  createdAt: string
}

export interface WriteHistoryInput {
  sectionKey: string
  changes: BalanceChange[]
  note: string | null
  affectsDisclosure: boolean
  /** 바꾼 어드민의 `users.id`. */
  actor: string
}

export type WriteHistoryResult = { ok: true } | { ok: false; message: string }

/** 이력 한 줄을 쓴다. 던지지 않고 결과를 돌려준다(호출한 저장 경로가 실패 때 방금 갱신을 되돌린다). */
export async function writeBalanceHistory(service: BalanceServiceClient, input: WriteHistoryInput): Promise<WriteHistoryResult> {
  try {
    const { error } = await service.from('balance_setting_changes').insert({
      section_key: input.sectionKey,
      changes: input.changes as Json,
      note: input.note,
      affects_disclosure: input.affectsDisclosure,
      changed_by: input.actor,
    })
    if (error) {
      console.error(`${LOG} 이력 쓰기 실패:`, error.message)
      return { ok: false, message: error.message }
    }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`${LOG} 이력 쓰기 예외:`, message)
    return { ok: false, message }
  }
}

/** DB의 `changes` JSON에서 읽을 수 있는 줄만 거른다(모양이 틀린 줄은 버린다). */
export function parseChanges(value: Json): BalanceChange[] {
  if (!Array.isArray(value)) return []
  const changes: BalanceChange[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const { field, from, to } = entry
    if (typeof field === 'string' && typeof from === 'number' && typeof to === 'number') changes.push({ field, from, to })
  }
  return changes
}

/**
 * 구역 하나의 최근 변경을 최신순으로 읽는다. 읽지 못하면 던진다(호출한 구역 화면이 «이력을 불러오지 못했어요»로 받는다).
 * 바꾼 사람의 이름은 `users`에서 따로 읽어 붙인다 — 결과에는 `username`만 남는다.
 */
export async function listBalanceHistory(
  service: BalanceServiceClient,
  sectionKey: string,
  limit: number = HISTORY_DEFAULT_LIMIT
): Promise<BalanceHistoryEntry[]> {
  const { data, error } = await service
    .from('balance_setting_changes')
    .select('id, section_key, changes, note, affects_disclosure, changed_by, created_at')
    .eq('section_key', sectionKey)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`변경 이력 조회 실패: ${error.message}`)
  const rows = data ?? []

  const actorIds = [...new Set(rows.map((row) => row.changed_by).filter((id): id is string => typeof id === 'string'))]
  const names = new Map<string, string | null>()
  if (actorIds.length > 0) {
    const users = await service.from('users').select('id, username').in('id', actorIds)
    if (users.error) throw new Error(`변경 이력의 이름 조회 실패: ${users.error.message}`)
    for (const user of users.data ?? []) names.set(user.id, user.username)
  }

  return rows.map((row) => ({
    id: row.id,
    sectionKey: row.section_key,
    changes: parseChanges(row.changes),
    note: row.note,
    affectsDisclosure: row.affects_disclosure,
    changedByName: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
    createdAt: row.created_at,
  }))
}
