/**
 * 캡슐·소멸 운영 신호 일일 요약 (티켓 20261031_1525, 상위 20261028_1743)
 *
 * `#jam-alert`에 하루 한 번 올릴 세 값을 읽고 글로 만든다. 읽기 전용이고 DB를 쓰지 않는다. 임계(주의·중단)는 정하지 않았다(오픈 4주 뒤 관찰값으로 정한다, 운영 로직 4.5절).
 *
 * - 소멸: `jam_transactions`의 `capsule_forfeit` 중 어제(KST) 행의 유저 수·잼 합, 그리고 어제가 속한 주(KST 월~일)의 누적(뷰 `jam_forfeit_weekly`).
 * - 한 번에 열린 캡슐: `capsule_opens`의 어제(KST) 총수와 «한 유저가 하루에 연 캡슐 수의 최댓값». 동기화 한 번을 직접 재는 칸이 없어 하루 최댓값으로 대신한다.
 * - 보류 유저 비율: `capsule_pending_rewards`에 행이 있는 유저 수 ÷ 전체 유저 수(지금 상태)와, 보류가 2개라 잼을 받을 수 없는 유저 수.
 *
 * 세 값은 따로 읽고 따로 실패한다(`null`). 유저 ID·이메일 같은 개인 값은 글에 싣지 않는다. 개수와 합만 싣는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.generated'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { kstDateString } from '@/lib/notifications/kst'

const LOG = '[capsule-signals]'
const DAY_MS = 24 * 60 * 60 * 1000
const UNREAD = '읽지 못했어요'

export interface CapsuleForfeitSignal {
  /** 어제(KST) 잼이 사라진 유저 수. */
  users: number
  /** 어제 사라진 잼의 합(양수). */
  amount: number
  /** 어제가 속한 주의 누적. 뷰를 읽지 못했으면 `null`, 그 주에 행이 없으면 0. */
  weekUsers: number | null
  weekAmount: number | null
}

export interface CapsuleOpensSignal {
  /** 어제(KST) 열린 캡슐 총수. */
  total: number
  /** 한 유저가 어제 하루에 연 캡슐 수의 최댓값. */
  maxPerUser: number
}

export interface CapsulePendingSignal {
  /** 보류가 하나 이상인 유저 수. */
  pendingUsers: number
  /** 보류가 2개라 잼을 받을 수 없는 유저 수. */
  blockedUsers: number
  /** 전체 유저 수. */
  totalUsers: number
}

export interface CapsuleDailySignals {
  /** 요약 대상 날짜(KST, `YYYY-MM-DD`). */
  day: string
  forfeit: CapsuleForfeitSignal | null
  opens: CapsuleOpensSignal | null
  pending: CapsulePendingSignal | null
}

type Service = SupabaseClient<Database>

/** `YYYY-MM-DD`가 속한 주의 월요일(`YYYY-MM-DD`). 뷰의 `week_start_kst`(KST 월요일)와 견주는 값이다. */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const sinceMonday = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readForfeit(service: Service, start: string, end: string, weekStart: string): Promise<CapsuleForfeitSignal> {
  const rows = await fetchAllRows<{ id: string; user_id: string; amount: number }>('소멸 어제 행', 'id', () =>
    service
      .from('jam_transactions')
      .select('id, user_id, amount')
      .eq('reason', 'capsule_forfeit')
      .gte('created_at', start)
      .lt('created_at', end)
  )
  const users = new Set(rows.map((row) => row.user_id)).size
  const amount = rows.reduce((sum, row) => sum - row.amount, 0)

  let weekUsers: number | null = null
  let weekAmount: number | null = null
  try {
    const { data, error } = await service
      .from('jam_forfeit_weekly')
      .select('user_count, forfeited_amount')
      .eq('week_start_kst', weekStart)
      .maybeSingle()
    if (error) throw new Error(error.message)
    // 그 주에 소멸이 없으면 뷰에 행이 없다. 0으로 본다.
    weekUsers = data?.user_count ?? 0
    weekAmount = data?.forfeited_amount ?? 0
  } catch (error) {
    console.error(`${LOG} 주 누적을 읽지 못했어요:`, errorText(error))
  }
  return { users, amount, weekUsers, weekAmount }
}

async function readOpens(service: Service, start: string, end: string): Promise<CapsuleOpensSignal> {
  const rows = await fetchAllRows<{ id: string; user_id: string }>('열린 캡슐', 'id', () =>
    service.from('capsule_opens').select('id, user_id').gte('opened_at', start).lt('opened_at', end)
  )
  const perUser = new Map<string, number>()
  for (const row of rows) perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + 1)
  return { total: rows.length, maxPerUser: Math.max(0, ...perUser.values()) }
}

async function readPending(service: Service): Promise<CapsulePendingSignal> {
  const rows = await fetchAllRows<{ id: string; user_id: string }>('보류 보상', 'id', () =>
    service.from('capsule_pending_rewards').select('id, user_id')
  )
  const perUser = new Map<string, number>()
  for (const row of rows) perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + 1)
  const { count, error } = await service.from('users').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  return {
    pendingUsers: perUser.size,
    blockedUsers: [...perUser.values()].filter((n) => n >= 2).length,
    totalUsers: count ?? 0,
  }
}

async function attempt<T>(label: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    console.error(`${LOG} ${label}을(를) 읽지 못했어요:`, errorText(error))
    return null
  }
}

/** 세 값을 읽는다. 각각 따로 실패하고 못 읽은 항목은 `null`이다. 어제는 `now` 기준 KST 어제 하루다. */
export async function readCapsuleDailySignals(service: Service, now: Date = new Date()): Promise<CapsuleDailySignals> {
  const day = kstDateString(new Date(now.getTime() - DAY_MS))
  const start = new Date(`${day}T00:00:00+09:00`)
  const end = new Date(start.getTime() + DAY_MS)
  const [forfeit, opens, pending] = await Promise.all([
    attempt('소멸', () => readForfeit(service, start.toISOString(), end.toISOString(), mondayOf(day))),
    attempt('열린 캡슐', () => readOpens(service, start.toISOString(), end.toISOString())),
    attempt('보류 유저', () => readPending(service)),
  ])
  return { day, forfeit, opens, pending }
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function forfeitLine(forfeit: CapsuleForfeitSignal | null): string {
  if (!forfeit) return `잼 소멸: ${UNREAD}`
  const week =
    forfeit.weekUsers === null || forfeit.weekAmount === null
      ? `어제가 속한 주 누적은 ${UNREAD}`
      : `어제가 속한 주 누적 ${fmt(forfeit.weekUsers)}명, ${fmt(forfeit.weekAmount)}잼`
  if (forfeit.users < 1) return forfeit.weekUsers ? `잼 소멸: 없음 (${week})` : '잼 소멸: 없음'
  return `참고 · 잼 소멸: ${fmt(forfeit.users)}명, ${fmt(forfeit.amount)}잼 (${week})`
}

function opensLine(opens: CapsuleOpensSignal | null): string {
  if (!opens) return `한 번에 열린 캡슐 (하루 기준): ${UNREAD}`
  return `한 번에 열린 캡슐 (하루 기준): 어제 열린 캡슐 ${fmt(opens.total)}개, 한 유저가 하루에 연 최댓값 ${fmt(opens.maxPerUser)}개`
}

function pendingLine(pending: CapsulePendingSignal | null): string {
  if (!pending || pending.totalUsers < 1) return `보류 유저 비율: ${UNREAD}`
  const percent = ((pending.pendingUsers / pending.totalUsers) * 100).toFixed(1)
  return `보류 유저 비율: ${fmt(pending.pendingUsers)}명 / 전체 ${fmt(pending.totalUsers)}명 (${percent}%), 보류가 2개라 잼을 받을 수 없는 유저 ${fmt(pending.blockedUsers)}명`
}

/** 세 항목을 모두 못 읽었는지. 그러면 글을 올리지 않는다. */
export function isAllUnread(signals: CapsuleDailySignals): boolean {
  const pendingUnread = !signals.pending || signals.pending.totalUsers < 1
  return !signals.forfeit && !signals.opens && pendingUnread
}

/** `#jam-alert`에 올릴 글. 임계는 적지 않는다. 개인 값 없이 개수와 합만 싣는다. */
export function formatCapsuleDailySignals(signals: CapsuleDailySignals): string {
  return [
    `캡슐 운영 신호 · 어제 요약 (${signals.day})`,
    forfeitLine(signals.forfeit),
    opensLine(signals.opens),
    pendingLine(signals.pending),
  ].join('\n')
}
