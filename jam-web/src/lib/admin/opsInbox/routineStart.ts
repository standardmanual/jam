/**
 * 루틴 「시작」 기록 (티켓 20261026_2032, 어드민 상황판 PRD §5.3 D2)
 *
 * 주간 루틴은 시작할 때 이 기록을 1번 보내고(`POST /api/admin/ops-inbox/routine-start`), 끝날 때 묶음을 제출한다.
 * 묶음의 `routine_run.run_key`가 시작 기록의 `run_key`와 같으면 둘이 이어진다(`bundle_id` 채움). 주차·작성자로 짐작해
 * 잇지 않는다 — 오탐 위험이 있어서 `run_key` 명시 일치로만 잇는다.
 *
 * - 순수: `validateRoutineStart`(본문 검증), `isRoutineStalled`(멈춤 판정)
 * - 서버: `recordRoutineStart`(저장), `linkRoutineStartToBundle`(제출 때 짝짓기, 실패해도 던지지 않는다)
 *
 * `author`는 자기 신고라 권한 판단에 쓰지 않는다. 기록에만 남긴다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { MAX_ROUTINE_AGENTS, MAX_RUN_KEY_CHARS, OPS_ROUTINE_STALL_HOURS } from '@/lib/admin/opsInbox/constants'

type ServiceClient = ReturnType<typeof createServiceClient>

const UNIQUE_VIOLATION = '23505'
const MAX_AUTHOR_CHARS = 100
const MAX_AGENT_NAME_CHARS = 100
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/
// 제출 쪽 `CONTROL_OR_LINE_BREAK`와 같다. 키가 로그·화면에서 줄을 깨지 않게 한다.
const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/

export interface RoutineStartInput {
  run_key: string
  week: string | null
  author: string
  agents: string[]
}

export type RoutineStartValidation =
  | { ok: true; value: RoutineStartInput }
  | { ok: false; errors: string[] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null
}

function describeShort(value: unknown): string {
  const text = typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? '없음')
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/** 시작 기록 본문 검증. 하나라도 틀리면 저장하지 않는다(한 줄짜리 기록이라 부분 저장이 없다). */
export function validateRoutineStart(raw: unknown): RoutineStartValidation {
  if (!isPlainObject(raw)) return { ok: false, errors: ['본문: 객체여야 해요.'] }
  const errors: string[] = []

  let runKey = ''
  if (!isPresent(raw.run_key)) errors.push('run_key: 필수 항목이 없어요.')
  else if (typeof raw.run_key !== 'string' || raw.run_key.trim().length === 0) {
    errors.push('run_key: 비어 있지 않은 문자열이어야 해요.')
  } else if (CONTROL_OR_LINE_BREAK.test(raw.run_key)) {
    errors.push('run_key: 줄바꿈이나 제어 문자를 넣을 수 없어요.')
  } else if (raw.run_key.trim().length > MAX_RUN_KEY_CHARS) {
    errors.push(`run_key: ${MAX_RUN_KEY_CHARS}자까지 받아요(받은 길이: ${raw.run_key.trim().length}자).`)
  } else {
    runKey = raw.run_key.trim()
  }

  let author = ''
  if (!isPresent(raw.author)) errors.push('author: 필수 항목이 없어요.')
  else if (typeof raw.author !== 'string' || raw.author.trim().length === 0) {
    errors.push('author: 비어 있지 않은 문자열이어야 해요.')
  } else if (raw.author.trim().length > MAX_AUTHOR_CHARS) {
    errors.push(`author: ${MAX_AUTHOR_CHARS}자까지 받아요(받은 길이: ${raw.author.trim().length}자).`)
  } else {
    author = raw.author.trim()
  }

  let week: string | null = null
  if (isPresent(raw.week)) {
    const match = typeof raw.week === 'string' ? WEEK_PATTERN.exec(raw.week) : null
    const weekNo = match ? Number(match[2]) : 0
    if (!match || weekNo < 1 || weekNo > 53) {
      errors.push(`week: YYYY-Www 형식이어야 해요(예: 2026-W41, 받은 값: ${describeShort(raw.week)}).`)
    } else {
      week = raw.week as string
    }
  }

  const agents: string[] = []
  if (!isPresent(raw.agents)) {
    errors.push('agents: 필수 항목이 없어요.')
  } else if (!Array.isArray(raw.agents)) {
    errors.push(`agents: 배열이어야 해요(받은 값: ${describeShort(raw.agents)}).`)
  } else if (raw.agents.length > MAX_ROUTINE_AGENTS) {
    errors.push(`agents: ${MAX_ROUTINE_AGENTS}개까지 받아요(받은 개수: ${raw.agents.length}개).`)
  } else {
    raw.agents.forEach((entry: unknown, index: number) => {
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        errors.push(`agents[${index}]: 비어 있지 않은 문자열이어야 해요(받은 값: ${describeShort(entry)}).`)
      } else if (entry.trim().length > MAX_AGENT_NAME_CHARS) {
        errors.push(`agents[${index}]: ${MAX_AGENT_NAME_CHARS}자까지 받아요(받은 길이: ${entry.trim().length}자).`)
      } else {
        agents.push(entry.trim())
      }
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { run_key: runKey, week, author, agents } }
}

/**
 * 멈춤 판정: 시작한 지 `OPS_ROUTINE_STALL_HOURS`시간이 **지났고** 묶음이 이어지지 않았으면 true.
 * 정확히 기준 시간이 된 순간은 아직 멈춤이 아니다(「3시간이 지나도」). 시각을 읽을 수 없으면 판정하지 않는다(false).
 */
export function isRoutineStalled(
  startedAt: string | Date,
  bundleId: string | null | undefined,
  now: Date,
  stallHours: number = OPS_ROUTINE_STALL_HOURS
): boolean {
  if (bundleId) return false
  const started = (startedAt instanceof Date ? startedAt : new Date(startedAt)).getTime()
  if (Number.isNaN(started) || Number.isNaN(now.getTime())) return false
  return now.getTime() - started > stallHours * 60 * 60 * 1000
}

export type RecordRoutineStartResult = { ok: true; created: boolean; id: string | null } | { ok: false }

/**
 * 시작 기록 저장. `run_key`가 이미 있으면 덮어쓰지 않고 `created: false`로 돌려준다(같은 키 재전송은 성공이다).
 * DB 오류 원문은 로그에만 남기고 부르는 쪽에는 `ok: false`만 돌려준다.
 */
export async function recordRoutineStart(
  service: ServiceClient,
  input: RoutineStartInput
): Promise<RecordRoutineStartResult> {
  const { data, error } = await service
    .from('ops_routine_starts')
    .insert({
      run_key: input.run_key,
      week: input.week,
      author: input.author,
      agents: input.agents as Json,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: true, created: false, id: null }
    console.error('[ops-inbox] 루틴 시작 기록 저장 실패:', error.message)
    return { ok: false }
  }
  return { ok: true, created: true, id: data?.id ?? null }
}

/**
 * 제출된 묶음과 같은 `run_key`의 시작 기록을 잇는다. 아직 이어지지 않은 기록만 채우고(`bundle_id`가 비어 있을 때) 이미 이어진
 * 기록은 바꾸지 않는다. 이 일이 실패해도 제출은 성공이어야 하므로 **절대 던지지 않고** 로그만 남긴다.
 */
export async function linkRoutineStartToBundle(
  service: ServiceClient,
  runKey: unknown,
  bundleUuid: string
): Promise<void> {
  if (typeof runKey !== 'string') return
  const key = runKey.trim()
  if (key.length === 0 || key.length > MAX_RUN_KEY_CHARS) return
  try {
    const { error } = await service
      .from('ops_routine_starts')
      .update({ bundle_id: bundleUuid })
      .eq('run_key', key)
      .is('bundle_id', null)
    if (error) console.error('[ops-inbox] 시작 기록 짝짓기 실패:', error.message)
  } catch (err) {
    console.error('[ops-inbox] 시작 기록 짝짓기 중 예외:', err instanceof Error ? err.name : 'unknown')
  }
}
