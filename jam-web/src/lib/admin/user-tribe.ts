/**
 * 어드민의 유저 트라이브 변경 (티켓 20261021_1247 2회, 운영 로직 2.4절·13.2절)
 *
 * 유저는 트라이브를 한 번 고르면 스스로 바꿀 수 없다(`users.tribe_id` 직접 쓰기는 마이그레이션 260이 막는다). 바꾸는 길은 어드민 변경 하나다.
 * 변경 한 번은 DB 함수 `admin_change_user_tribe`(마이그레이션 259)가 **한 트랜잭션**으로 처리한다:
 * 유저 행 잠금 → 검사 → `users.tribe_id` 갱신 → `mission_cancel_for_tribe_change`(갱신 뒤) → `user_tribe_changes` 기록 삽입.
 * 이 파일은 그 함수를 부르고, 성공하면 소식을 보낸다.
 *
 * - **사유**: 고정 목록 4종 + «기타» 메모(필수). 목록은 이 파일의 상수이고 DB에는 사유 코드와 메모를 문자열로만 남긴다(CHECK 없음 — 목록을 바꿀 때 마이그레이션이 필요 없다).
 * - **거절은 던지지 않는다.** 유저 없음·트라이브 없는 유저·고를 수 없는 트라이브·같은 트라이브·사유 문제는 `{ ok: false, code }`로 돌려준다(라우트가 400·404·409로 바꾼다).
 *   예상하지 못한 DB 오류와 해석할 수 없는 응답은 던진다. 호출한 라우트가 로그를 남기고 고정 문구로 응답한다(DB 오류 원문은 응답에 싣지 않는다).
 * - **소식은 던지지 않는다.** 변경이 성공한 뒤 «트라이브가 바뀌었어요» 한 건과, 취소된 미션이 있으면 취소 소식 한 건(`participation-cancel.ts`)을 보낸다.
 *   소식은 변경의 곁다리라 실패해도 변경은 유지한다(`createNotification`이 실패를 로그로 남기고 null을 돌려준다).
 *   유저 알림에는 사유를 싣지 않는다 — 사유는 `user_tribe_changes`에만 남는다.
 * - **영향 미리 보기**(`previewTribeChange`)는 읽기만 한다. 취소될 미션을 `mission_cancel_for_tribe_change`와 같은 기준으로 고른다:
 *   트라이브 제한이 있는 미션(`mission_allowed_tribes` 행이 하나 이상)이고 새 트라이브가 그 대상에 없으면 취소된다. 끝난 미션의 참가도 포함한다.
 *
 * 서버 전용이다. 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import { notifyMissionParticipationCancelled, type CancelledMission } from '@/lib/missions/participation-cancel'

type ServiceClient = ReturnType<typeof createServiceClient>

// ─────────────────────────────────────────────────────────────────────────────
// 사유 (고정 목록 + «기타» 메모)
// ─────────────────────────────────────────────────────────────────────────────

export type TribeChangeReasonCode = 'wrong_pick' | 'user_request' | 'ops_fix' | 'other'

export interface TribeChangeReasonOption {
  value: TribeChangeReasonCode
  label: string
}

/** 어드민이 고르는 사유 목록. 메모는 «기타»일 때만 필수이고 나머지 셋은 선택이다 */
export const TRIBE_CHANGE_REASONS: readonly TribeChangeReasonOption[] = [
  { value: 'wrong_pick', label: '유저가 잘못 골랐어요' },
  { value: 'user_request', label: '유저가 옮기길 원해요' },
  { value: 'ops_fix', label: '운영 정정' },
  { value: 'other', label: '기타' },
]

/** 메모가 필수인 사유 */
export const TRIBE_CHANGE_MEMO_REQUIRED_REASON: TribeChangeReasonCode = 'other'

/** 메모 길이 상한(앞뒤 공백을 지운 뒤 글자 수) */
export const TRIBE_CHANGE_MEMO_MAX_LENGTH = 200

const REASON_VALUES = new Set<string>(TRIBE_CHANGE_REASONS.map((r) => r.value))

export function isTribeChangeReasonCode(value: unknown): value is TribeChangeReasonCode {
  return typeof value === 'string' && REASON_VALUES.has(value)
}

/** 사유 코드 → 사람이 읽는 라벨(변경 이력 표시용). 목록에서 빠진 옛 코드는 코드 그대로 보인다. 값이 없으면 «—» */
export function tribeChangeReasonLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return TRIBE_CHANGE_REASONS.find((r) => r.value === value)?.label ?? value
}

export type TribeChangeInputFailure = 'invalid_reason' | 'invalid_memo' | 'memo_required' | 'memo_too_long'

export type TribeChangeInputParse =
  | { ok: true; reasonCode: TribeChangeReasonCode; memo: string | null }
  | { ok: false; code: TribeChangeInputFailure }

/**
 * 사유 코드와 메모를 검증한다. 메모는 앞뒤 공백을 지우고, 비면 `null`이다.
 * 코드가 목록에 없으면 `invalid_reason`, 메모가 문자열이 아니면(숫자·객체) 없는 것으로 보지 않고 `invalid_memo`,
 * «기타»인데 메모가 비면 `memo_required`, 메모가 상한을 넘으면 `memo_too_long`.
 */
export function parseTribeChangeInput(reasonCode: unknown, memo: unknown): TribeChangeInputParse {
  if (!isTribeChangeReasonCode(reasonCode)) return { ok: false, code: 'invalid_reason' }
  if (memo !== undefined && memo !== null && typeof memo !== 'string') return { ok: false, code: 'invalid_memo' }

  const trimmed = typeof memo === 'string' ? memo.trim() : ''
  if (trimmed.length > TRIBE_CHANGE_MEMO_MAX_LENGTH) return { ok: false, code: 'memo_too_long' }
  if (reasonCode === TRIBE_CHANGE_MEMO_REQUIRED_REASON && trimmed.length === 0) return { ok: false, code: 'memo_required' }
  return { ok: true, reasonCode, memo: trimmed.length > 0 ? trimmed : null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 변경
// ─────────────────────────────────────────────────────────────────────────────

/** DB 함수가 돌려주는 거절 코드 가운데 라우트가 구분해 응답하는 것 */
export type ChangeUserTribeFailure = TribeChangeInputFailure | 'user_not_found' | 'no_tribe' | 'invalid_tribe' | 'same_tribe'

export interface ChangeUserTribeInput {
  /** 바꾸는 어드민의 id. `users`에 없으면 DB가 `changed_by`를 NULL로 남긴다 */
  adminId: string
  userId: string
  newTribeId: string
  /** 라우트가 본문에서 꺼낸 값 그대로다 — 문자열인지, 목록에 있는지는 이 파일이 검사한다 */
  reasonCode: unknown
  memo?: unknown
}

export interface ChangedUserTribe {
  changeId: string
  fromTribeId: string
  toTribeId: string
  toTribeName: string
  /** 이 변경으로 참가가 취소된 미션. 없으면 빈 배열 */
  cancelledMissions: CancelledMission[]
}

export type ChangeUserTribeResult = ({ ok: true } & ChangedUserTribe) | { ok: false; code: ChangeUserTribeFailure }

const DB_FAILURE_CODES: Record<string, ChangeUserTribeFailure> = {
  // 앱이 먼저 검증하므로 DB의 reason_required는 사실상 오지 않는다. 오면 사유 문제로 돌려준다
  reason_required: 'invalid_reason',
  user_not_found: 'user_not_found',
  no_tribe: 'no_tribe',
  invalid_tribe: 'invalid_tribe',
  same_tribe: 'same_tribe',
}

/** `admin_change_user_tribe`의 JSON 응답을 해석한다. 해석할 수 없으면 던진다(모르는 응답을 성공으로 보지 않는다) */
export function parseChangeResult(data: unknown): ChangeUserTribeResult {
  if (typeof data !== 'object' || data === null) throw new Error('admin_change_user_tribe가 해석할 수 없는 응답을 돌려줬다')
  const r = data as Record<string, unknown>

  if (r.ok === false) {
    const code = typeof r.code === 'string' ? DB_FAILURE_CODES[r.code] : undefined
    if (!code) throw new Error(`admin_change_user_tribe가 모르는 거절 코드를 돌려줬다: ${String(r.code)}`)
    return { ok: false, code }
  }

  if (
    r.ok !== true ||
    typeof r.changeId !== 'string' ||
    typeof r.fromTribeId !== 'string' ||
    typeof r.toTribeId !== 'string' ||
    typeof r.toTribeName !== 'string' ||
    !Array.isArray(r.cancelled)
  ) {
    throw new Error('admin_change_user_tribe가 해석할 수 없는 응답을 돌려줬다')
  }

  const cancelledMissions: CancelledMission[] = []
  for (const item of r.cancelled) {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    if (typeof row.missionId !== 'string') throw new Error('admin_change_user_tribe의 취소 목록을 해석할 수 없다')
    cancelledMissions.push({ id: row.missionId, title: typeof row.title === 'string' ? row.title : '' })
  }

  return {
    ok: true,
    changeId: r.changeId,
    fromTribeId: r.fromTribeId,
    toTribeId: r.toTribeId,
    toTribeName: r.toTribeName,
    cancelledMissions,
  }
}

/**
 * 변경 성공 뒤 소식을 보낸다. 던지지 않는다 — 소식이 실패해도 이미 끝난 변경을 깨지 않는다.
 * «트라이브가 바뀌었어요»는 변경 기록 id로 한 번만 만든다(같은 유저를 여러 번 바꾸면 변경마다 한 건씩 쌓인다).
 */
async function notifyTribeChange(userId: string, changed: ChangedUserTribe): Promise<void> {
  try {
    await createNotification({
      userId,
      type: 'tribe_changed',
      payload: { new_tribe_name: changed.toTribeName },
      groupKey: scopedGroupKey('tribe_changed', changed.changeId),
      mode: 'once',
    })
  } catch (error) {
    console.error(`[admin/user-tribe] 트라이브 변경 소식 실패 — userId: ${userId}, changeId: ${changed.changeId}:`, error)
  }

  try {
    await notifyMissionParticipationCancelled(userId, changed.cancelledMissions)
  } catch (error) {
    console.error(`[admin/user-tribe] 참가 취소 소식 실패 — userId: ${userId}, changeId: ${changed.changeId}:`, error)
  }
}

/**
 * 유저의 트라이브를 바꾼다. 사유를 검증하고 `admin_change_user_tribe`를 부른 뒤, 성공하면 소식을 보낸다.
 * 거절은 `{ ok: false, code }`로 돌려주고(DB는 아무것도 바꾸지 않았다), 예상하지 못한 오류는 던진다.
 */
export async function changeUserTribe(supabase: ServiceClient, input: ChangeUserTribeInput): Promise<ChangeUserTribeResult> {
  const parsed = parseTribeChangeInput(input.reasonCode, input.memo)
  if (!parsed.ok) return parsed

  const { data, error } = await supabase.rpc('admin_change_user_tribe', {
    p_admin_id: input.adminId,
    p_user_id: input.userId,
    p_new_tribe_id: input.newTribeId,
    p_reason_code: parsed.reasonCode,
    // 메모가 없으면 키를 생략해 DB 기본값(NULL)을 쓴다 — 생성 타입이 null을 받지 않는다
    ...(parsed.memo !== null ? { p_memo: parsed.memo } : {}),
  })
  if (error) throw new Error(`admin_change_user_tribe RPC 실패: ${error.message}`)

  const result = parseChangeResult(data)
  if (!result.ok) return result

  await notifyTribeChange(input.userId, result)
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// 영향 미리 보기 (읽기만)
// ─────────────────────────────────────────────────────────────────────────────

/** 작은 표를 통째로 읽을 때의 페이지 크기(PostgREST 1,000행 상한 아래) */
const PAGE_SIZE = 1000
/** `.in()`에 한 번에 넘기는 id 수 — 긴 목록이 URL 길이 한도를 넘지 않게 나눈다 */
const IN_CHUNK = 100

async function readAllPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

/**
 * 이 유저의 트라이브를 `newTribeId`로 바꾸면 참가가 취소될 미션 목록(참가한 순서). 읽기만 하고 아무것도 바꾸지 않는다.
 * `mission_cancel_for_tribe_change`와 같은 기준이다: 트라이브 제한이 있는 미션이고 새 트라이브가 그 대상에 없으면 취소된다(끝난 미션의 참가도 포함).
 * 읽지 못하면 던진다 — 빈 목록(취소될 미션 없음)으로 보이면 어드민이 영향을 모른 채 변경하게 된다.
 */
export async function previewTribeChange(supabase: ServiceClient, userId: string, newTribeId: string): Promise<CancelledMission[]> {
  const participations = await readAllPages<{ mission_id: string }>(
    (from, to) =>
      supabase
        .from('user_mission_participations')
        .select('mission_id')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .order('mission_id', { ascending: true })
        .range(from, to),
    'user_mission_participations'
  )
  if (participations.length === 0) return []

  // 허용 트라이브 표는 트라이브 제한 미션 수 × 트라이브 수라 작다 — 통째로 읽어 메모리에서 맞춘다(참가 id 목록을 `.in()`에 길게 싣지 않는다)
  const allowed = await readAllPages<{ mission_id: string; tribe_id: string }>(
    (from, to) =>
      supabase
        .from('mission_allowed_tribes')
        .select('mission_id, tribe_id')
        .order('mission_id', { ascending: true })
        .order('tribe_id', { ascending: true })
        .range(from, to),
    'mission_allowed_tribes'
  )
  const allowedByMission = new Map<string, Set<string>>()
  for (const row of allowed) {
    const set = allowedByMission.get(row.mission_id) ?? new Set<string>()
    set.add(row.tribe_id)
    allowedByMission.set(row.mission_id, set)
  }

  const cancelledIds: string[] = []
  const seen = new Set<string>()
  for (const { mission_id } of participations) {
    if (seen.has(mission_id)) continue
    seen.add(mission_id)
    const tribes = allowedByMission.get(mission_id)
    if (tribes && !tribes.has(newTribeId)) cancelledIds.push(mission_id)
  }
  if (cancelledIds.length === 0) return []

  const titleById = new Map<string, string>()
  for (let i = 0; i < cancelledIds.length; i += IN_CHUNK) {
    const chunk = cancelledIds.slice(i, i + IN_CHUNK)
    const { data, error } = await supabase.from('missions').select('id, title').in('id', chunk)
    if (error) throw new Error(`missions 조회 실패: ${error.message}`)
    for (const row of data ?? []) titleById.set(row.id, row.title)
  }
  return cancelledIds.map((id) => ({ id, title: titleById.get(id) ?? '' }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 최근 변경 이력 (읽기만)
// ─────────────────────────────────────────────────────────────────────────────

export interface TribeChangeHistoryItem {
  id: string
  createdAt: string
  fromTribeId: string
  /** 이름을 읽지 못하면 null */
  fromTribeName: string | null
  toTribeId: string
  toTribeName: string | null
  reasonCode: string
  /** 목록에 있는 코드는 라벨, 옛 코드는 코드 그대로 */
  reasonLabel: string
  memo: string | null
  /** 바꾼 어드민의 이메일. 계정이 없어졌거나 읽지 못하면 null */
  changedByEmail: string | null
  cancelledMissionCount: number
}

/** 기본으로 읽는 최근 이력 건수 */
export const TRIBE_CHANGE_HISTORY_LIMIT = 10

/**
 * 유저 한 명의 최근 트라이브 변경 이력(최신순). 읽지 못하면 던진다 — «이력 없음»과 «읽지 못함»이 같은 빈 목록으로 보이면 안 된다.
 * 트라이브 이름과 바꾼 어드민 이메일은 따로 읽어 붙인다.
 */
export async function fetchTribeChangeHistory(
  supabase: ServiceClient,
  userId: string,
  limit: number = TRIBE_CHANGE_HISTORY_LIMIT
): Promise<TribeChangeHistoryItem[]> {
  const { data, error } = await supabase
    .from('user_tribe_changes')
    .select('id, created_at, from_tribe_id, to_tribe_id, reason_code, memo, changed_by, cancelled_mission_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`user_tribe_changes 조회 실패: ${error.message}`)
  const rows = data ?? []
  if (rows.length === 0) return []

  const tribeIds = [...new Set(rows.flatMap((r) => [r.from_tribe_id, r.to_tribe_id]))]
  const tribes = await supabase.from('tribes').select('id, name').in('id', tribeIds)
  if (tribes.error) throw new Error(`tribes 조회 실패: ${tribes.error.message}`)
  const tribeName = new Map((tribes.data ?? []).map((t) => [t.id, t.name]))

  const adminIds = [...new Set(rows.map((r) => r.changed_by).filter((id): id is string => id !== null))]
  const adminEmail = new Map<string, string>()
  if (adminIds.length > 0) {
    const admins = await supabase.from('users').select('id, email').in('id', adminIds)
    if (admins.error) throw new Error(`users 조회 실패: ${admins.error.message}`)
    for (const a of admins.data ?? []) adminEmail.set(a.id, a.email)
  }

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    fromTribeId: r.from_tribe_id,
    fromTribeName: tribeName.get(r.from_tribe_id) ?? null,
    toTribeId: r.to_tribe_id,
    toTribeName: tribeName.get(r.to_tribe_id) ?? null,
    reasonCode: r.reason_code,
    reasonLabel: tribeChangeReasonLabel(r.reason_code),
    memo: r.memo,
    changedByEmail: r.changed_by ? adminEmail.get(r.changed_by) ?? null : null,
    cancelledMissionCount: r.cancelled_mission_count,
  }))
}
