/**
 * 앰비언트 드랍 날짜 예약 저장소 — 서버 함수 5동작과 실행기용 내부 함수 (티켓 20261001_2051)
 *
 * 어드민 라우트(티켓 20261001_2052)와 운영툴 자원 연결(티켓 20260930_1500)이 같은 함수를 부른다
 * (1500은 HTTP가 아니라 이 함수를 부른다). 이 파일의 어떤 함수도 `ambient_drop_config`에 쓰지 않는다.
 *
 * | 동작 | 함수 |
 * |---|---|
 * | 만들기 | `createAmbientDropSchedule` — 입력 검증 → 종류 확인 → 예정 시각 기준 대상 판정 → INSERT |
 * | 공개 전 취소 | `cancelScheduledAmbientDrop` — `scheduled`일 때만, 실행 중·실행 뒤는 409 |
 * | 공개 전 시각 수정 | `rescheduleAmbientDrop` — 정시·미래·새 시각 기준 대상 판정, `scheduled`일 때만(놓침으로 읽히면 409) |
 * | 상태 읽기 | `getAmbientDropSchedule` — 행과 파생 상태(`missed`·`stalled`) |
 * | 실행 후 취소 | 위 취소가 409로 거절한다. 놓은 드랍은 내리지 않는다 |
 *
 * 취소·선점·시각 수정은 모두 `status='scheduled'` 조건을 단 UPDATE 한 번이라, 취소와 선점이 겹쳐도
 * 한쪽만 이긴다(`cancelScheduledRecipe`와 같은 방식). 0행이면 행을 다시 읽어 404와 409를 가른다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/admin/uuid'
import type { AmbientDropScheduleRow, AmbientDropScheduleStatus } from '@/types/database'
import type { Json } from '@/types/database.generated'
import {
  AMBIENT_SCHEDULE_LATE_WINDOW_MS,
  ambientDropScheduleState,
  parseAmbientDropScheduleInput,
  parseScheduledAt,
  rowFromSpec,
  specFromRow,
  type AmbientDropScheduleState,
} from './scheduleSpec'
import { describeScheduleTargetProblems, loadScheduleTargets } from './scheduleTargets'

type ServiceClient = ReturnType<typeof createServiceClient>

const TABLE = 'ambient_drop_schedules'

export type CreateAmbientDropScheduleResult =
  | { ok: true; schedule: AmbientDropScheduleRow }
  | { ok: false; status: 400 | 500; error: string }

export type CancelAmbientDropScheduleResult = { ok: true } | { ok: false; status: 404 | 409 | 500; error: string }

export type RescheduleAmbientDropResult =
  | { ok: true; schedule: AmbientDropScheduleRow }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

export type GetAmbientDropScheduleResult =
  | { ok: true; schedule: AmbientDropScheduleRow; state: AmbientDropScheduleState }
  | { ok: false; status: 404 | 500; error: string }

const SAVE_FAILED = '예약을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
const CANCEL_FAILED = '예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.'
const NOT_FOUND = '예약을 찾을 수 없어요. 이미 지워졌거나 잘못된 주소예요. 예약 목록에서 다시 확인해 주세요.'
const TARGET_CHECK_FAILED = '예약 대상을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'

/** 이미 시작됐거나 끝난 예약을 건드릴 때의 문장 */
function notScheduledMessage(status: AmbientDropScheduleStatus, action: '취소' | '수정'): string {
  switch (status) {
    case 'running':
      return `지금 드랍을 놓는 중인 예약이라 ${action}할 수 없어요. 놓는 중인 드랍은 멈출 수 없어요. 끝난 뒤 예약 목록에서 결과를 확인해 주세요.`
    case 'canceled':
      return `이미 취소된 예약이에요. 취소된 예약은 ${action}할 수 없어요. 새로 등록해 주세요.`
    case 'missed':
      return `예정 시각에서 3시간이 지나 놓친 예약이라 ${action}할 수 없어요. 다시 놓으려면 새 예약을 등록해 주세요.`
    default:
      return `이미 처리된 예약이라 ${action}할 수 없어요. 놓은 드랍은 내리지 않아요. 새 예약을 등록해 주세요.`
  }
}

/** 예약 1건을 읽는다. 없으면 null, 조회 실패면 던진다 */
async function readSchedule(supabase: ServiceClient, id: string): Promise<AmbientDropScheduleRow | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as AmbientDropScheduleRow | null) ?? null
}

/**
 * 예약 등록. 입력 검증(`parseAmbientDropScheduleInput`) → 지점 종류 존재 확인 → 「예정 시각」 기준 대상 판정 →
 * INSERT. 등록 판정은 지금이 아니라 예정 시각 기준이다 — 지금은 공개 전이지만 예정 시각에 공개되는 컬렉션은
 * 통과하고, 예정 시각에 기간이 끝난 컬렉션은 걸린다. 걸린 대상이 하나라도 있으면 400이다(fail-closed).
 */
export async function createAmbientDropSchedule(
  supabase: ServiceClient,
  body: unknown,
  createdBy: string | null,
  now: Date = new Date()
): Promise<CreateAmbientDropScheduleResult> {
  const parsed = parseAmbientDropScheduleInput(body, now)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const { spec, title } = parsed
  const scheduledAt = parsed.scheduledAt as string // allowNow가 아니면 항상 값이 있다

  if (spec.poiMode === 'category' && spec.poiCategory) {
    const { data, error } = await supabase.from('poi_categories').select('slug').eq('slug', spec.poiCategory).maybeSingle()
    if (error) {
      console.error('[ambient-drop-schedule] 지점 종류 확인 실패:', error.message)
      return { ok: false, status: 500, error: TARGET_CHECK_FAILED }
    }
    if (!data) {
      return {
        ok: false,
        status: 400,
        error: '지점 종류를 찾을 수 없어요. 선택한 종류가 지워졌거나 잘못된 값이에요. 지점 종류를 다시 선택해 주세요.',
      }
    }
  }

  let problem: string | null
  try {
    problem = describeScheduleTargetProblems(await loadScheduleTargets(supabase, spec, scheduledAt))
  } catch (err) {
    console.error('[ambient-drop-schedule] 등록 대상 판정 실패:', err)
    return { ok: false, status: 500, error: TARGET_CHECK_FAILED }
  }
  if (problem) return { ok: false, status: 400, error: problem }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rowFromSpec(spec, scheduledAt, createdBy, title))
    .select()
    .single()
  if (error) {
    console.error('[ambient-drop-schedule] 예약 저장 실패:', error.message)
    return { ok: false, status: 500, error: SAVE_FAILED }
  }
  return { ok: true, schedule: data as AmbientDropScheduleRow }
}

/**
 * 공개(실행) 전 예약 취소. `UPDATE … SET status='canceled' WHERE id=? AND status='scheduled'` 한 번이라 선점과
 * 겹쳐도 한쪽만 이긴다. 0행이면 행을 다시 읽어 «없음»(404)과 «이미 시작·끝남»(409)을 가른다.
 */
export async function cancelScheduledAmbientDrop(
  supabase: ServiceClient,
  id: string,
  now: Date = new Date()
): Promise<CancelAmbientDropScheduleResult> {
  const notFound = { ok: false, status: 404, error: NOT_FOUND } as const
  if (!isUuid(id)) return notFound

  const iso = now.toISOString()
  const { data: canceled, error } = await supabase
    .from(TABLE)
    .update({ status: 'canceled', canceled_at: iso, updated_at: iso })
    .eq('id', id)
    .eq('status', 'scheduled')
    .select('id')
  if (error) {
    console.error('[ambient-drop-schedule] 예약 취소 실패:', error.message)
    return { ok: false, status: 500, error: CANCEL_FAILED }
  }
  if ((canceled ?? []).length > 0) return { ok: true }

  let existing: AmbientDropScheduleRow | null
  try {
    existing = await readSchedule(supabase, id)
  } catch (err) {
    console.error('[ambient-drop-schedule] 예약 취소 후 행 확인 실패:', err)
    return { ok: false, status: 500, error: CANCEL_FAILED }
  }
  if (!existing) return notFound
  return { ok: false, status: 409, error: notScheduledMessage(existing.status, '취소') }
}

/**
 * 공개(실행) 전 예약 시각 수정. 정시·미래 검증 → 새 시각 기준 대상 판정 → `status='scheduled'` 조건부 UPDATE.
 * 파생 상태가 `missed`(예정 시각 + 3시간 경과)면 cron이 표시하기 전이어도 409다. 다시 놓으려면 새로 등록한다.
 * 내용(지점·아이템)은 바꾸지 않는다 — 내용을 바꾸려면 취소 후 새로 등록한다.
 */
export async function rescheduleAmbientDrop(
  supabase: ServiceClient,
  id: string,
  scheduledAtIso: unknown,
  now: Date = new Date()
): Promise<RescheduleAmbientDropResult> {
  const notFound = { ok: false, status: 404, error: NOT_FOUND } as const
  if (!isUuid(id)) return notFound

  const at = parseScheduledAt(scheduledAtIso, now)
  if (!at.ok) return { ok: false, status: 400, error: at.error }

  let existing: AmbientDropScheduleRow | null
  try {
    existing = await readSchedule(supabase, id)
  } catch (err) {
    console.error('[ambient-drop-schedule] 예약 읽기 실패:', err)
    return { ok: false, status: 500, error: SAVE_FAILED }
  }
  if (!existing) return notFound
  if (existing.status !== 'scheduled') {
    return { ok: false, status: 409, error: notScheduledMessage(existing.status, '수정') }
  }
  // 화면에 «놓침»으로 보이는 예약(예정 시각 + 3시간 경과)은 cron이 표시하기 전이어도 같은 409다 — cron 시각에 따라 결과가 갈리지 않게 한다
  if (ambientDropScheduleState(existing, now) === 'missed') {
    return { ok: false, status: 409, error: notScheduledMessage('missed', '수정') }
  }

  let problem: string | null
  try {
    problem = describeScheduleTargetProblems(await loadScheduleTargets(supabase, specFromRow(existing), at.value))
  } catch (err) {
    console.error('[ambient-drop-schedule] 시각 수정 대상 판정 실패:', err)
    return { ok: false, status: 500, error: TARGET_CHECK_FAILED }
  }
  if (problem) return { ok: false, status: 400, error: problem }

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update({ scheduled_at: at.value, updated_at: now.toISOString() })
    .eq('id', id)
    .eq('status', 'scheduled')
    .select()
  if (error) {
    console.error('[ambient-drop-schedule] 예약 시각 수정 실패:', error.message)
    return { ok: false, status: 500, error: SAVE_FAILED }
  }
  if ((updated ?? []).length > 0) return { ok: true, schedule: (updated as AmbientDropScheduleRow[])[0] }

  // 읽고 쓰는 사이에 선점·취소가 이겼다 — 행을 다시 읽어 사유를 가른다
  let latest: AmbientDropScheduleRow | null
  try {
    latest = await readSchedule(supabase, id)
  } catch (err) {
    console.error('[ambient-drop-schedule] 시각 수정 후 행 확인 실패:', err)
    return { ok: false, status: 500, error: SAVE_FAILED }
  }
  if (!latest) return notFound
  return { ok: false, status: 409, error: notScheduledMessage(latest.status, '수정') }
}

/** 예약 1건과 파생 상태(`missed`·`stalled`)를 읽는다. 1500·어드민 화면이 쓴다 */
export async function getAmbientDropSchedule(
  supabase: ServiceClient,
  id: string,
  now: Date = new Date()
): Promise<GetAmbientDropScheduleResult> {
  if (!isUuid(id)) return { ok: false, status: 404, error: NOT_FOUND }
  try {
    const schedule = await readSchedule(supabase, id)
    if (!schedule) return { ok: false, status: 404, error: NOT_FOUND }
    return { ok: true, schedule, state: ambientDropScheduleState(schedule, now) }
  } catch (err) {
    console.error('[ambient-drop-schedule] 예약 읽기 실패:', err)
    return { ok: false, status: 500, error: '예약을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
}

// ── 실행기용 내부 함수 ────────────────────────────────────────────────────────

/**
 * 예정 시각에서 3시간이 지나도록 실행되지 않은 `scheduled` 예약을 `missed`로 표시한다. 놓지 않는다.
 * 조건부 UPDATE 한 번이라 같은 시각에 선점이 이기면 그 예약은 건드리지 않는다. 표시한 건수를 돌려준다.
 */
export async function markMissedAmbientDropSchedules(supabase: ServiceClient, now: Date): Promise<number> {
  const iso = now.toISOString()
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'missed', finished_at: iso, updated_at: iso, result: { reason: 'missed' } })
    .eq('status', 'scheduled')
    .lt('scheduled_at', new Date(now.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS).toISOString())
    .select('id')
  if (error) throw new Error(`놓친 예약 표시 실패: ${error.message}`)
  return (data ?? []).length
}

/**
 * 도래한 예약(예정 시각이 지났고 3시간 안)을 예정 시각 순으로 `limit`건까지 선점한다. 후보 id를 읽고 한 건씩
 * `UPDATE … SET status='running', claimed_at=now WHERE id=? AND status='scheduled' RETURNING *`로 가져온다 —
 * 동시에 호출돼도 같은 예약을 둘이 가져가지 않는다(`claimAmbientDropAutoRun`과 같은 방식). 선점에 진 후보는 건너뛴다.
 */
export async function claimDueAmbientDropSchedules(
  supabase: ServiceClient,
  now: Date,
  limit: number
): Promise<AmbientDropScheduleRow[]> {
  const iso = now.toISOString()
  const { data: candidates, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', iso)
    .gte('scheduled_at', new Date(now.getTime() - AMBIENT_SCHEDULE_LATE_WINDOW_MS).toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`도래한 예약 조회 실패: ${error.message}`)

  const claimed: AmbientDropScheduleRow[] = []
  for (const candidate of (candidates ?? []) as { id: string }[]) {
    const { data, error: claimError } = await supabase
      .from(TABLE)
      .update({ status: 'running', claimed_at: iso, updated_at: iso })
      .eq('id', candidate.id)
      .eq('status', 'scheduled')
      .select()
    if (claimError) {
      console.error('[ambient-drop-schedule] 예약 선점 실패:', claimError.message)
      continue
    }
    if ((data ?? []).length > 0) claimed.push((data as AmbientDropScheduleRow[])[0])
  }
  return claimed
}

/** 실행을 마친 예약의 최종 상태와 결과를 남긴다. `running`일 때만 바꾼다. 성공 여부를 돌려준다 */
export async function finishAmbientDropSchedule(
  supabase: ServiceClient,
  id: string,
  status: Extract<AmbientDropScheduleStatus, 'done' | 'skipped' | 'failed'>,
  result: Json,
  now: Date
): Promise<boolean> {
  const iso = now.toISOString()
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status, result, finished_at: iso, updated_at: iso })
    .eq('id', id)
    .eq('status', 'running')
    .select('id')
  if (error) {
    console.error('[ambient-drop-schedule] 예약 결과 기록 실패:', error.message, { id, status })
    return false
  }
  return (data ?? []).length > 0
}
