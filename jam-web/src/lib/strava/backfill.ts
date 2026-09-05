/**
 * 기존 `strava_activities.normalized`에 v5 확장 6필드를 채우는 백필 (티켓 20260905_0029)
 *
 * ## 왜 일반 싱크로는 안 되는가
 * `getProcessedStravaIds()`(`sync.ts`)가 이미 처리된 활동을 **전부** 걸러낸다. 멱등 처리의
 * 핵심이라 손대면 안 되는 로직이고, 그래서 확장 필드는 앞으로 들어오는 활동에만 붙는다.
 * 기존 873행(실측 2026-09-05)은 이 전용 경로로만 채울 수 있다.
 *
 * ## 절대 하지 않는 것 (티켓 확정 사항)
 * - **배지 평가·아이템 드랍·미션 판정·소식 생성·피드 기록을 하지 않는다.** 수년치 이력을
 *   다시 엔진에 태우면 배지 홍수가 난다. 이 모듈은 badge-engine·drop-engine·missions·
 *   notifications를 **import조차 하지 않는다**
 * - **`strava_connections.last_synced_at`을 건드리지 않는다.** 커서가 밀리면 그 사이 올라온
 *   활동이 영영 조회 대상에서 빠진다 (2026-08-10 신규 유저 미발급 인시던트와 같은 실패 모드)
 * - **`normalized`의 기존 키를 지우거나 덮어쓰지 않는다.** 확장 6필드만 병합한다
 *
 * ## 비용
 * **목록 엔드포인트만 쓴다** — 활동 1건당 1회인 상세 엔드포인트를 쓰지 않는다. 유저당
 * `ceil(활동수 / 200)`회면 끝나고, 실측 기준선(유저 10명·873행)에서 총 20회 안팎이다.
 * `splits_metric`(→ `negative_split`)은 상세 응답에만 있어 이번 범위에서 제외했다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/utils'
import { getActivities, refreshStravaToken, ACTIVITIES_PAGE_SIZE } from '@/lib/strava/api'
import { extractExtendedActivityFields, EXTENDED_ACTIVITY_FIELD_KEYS } from '@/types/strava'
import type { StravaSummaryActivity } from '@/types/strava'
import type { StravaConnectionRow } from '@/types/database'

/** 한 유저에게서 훑을 목록 페이지 상한. 200 × 50 = 활동 10,000건 */
const MAX_PAGES_PER_USER = 50

/**
 * 전체 실행에서 허용할 Strava 요청 수 상한.
 * Strava 읽기 제한은 15분당 100회 / 하루 1,000회다. 여유를 두고 90에서 멈춘다 —
 * 병합만 하는 멱등 작업이라 중단 후 다시 돌려도 결과가 같다.
 */
const DEFAULT_REQUEST_BUDGET = 90

/** 요청 사이 대기(ms). 15분 창을 고르게 쓰기 위한 값이지 정확도가 필요한 값은 아니다 */
const DEFAULT_REQUEST_DELAY_MS = 1_500

/** DB에서 활동 행을 읽어올 때의 페이지 크기 (PostgREST 기본 상한 회피) */
const DB_PAGE_SIZE = 500

export interface BackfillOptions {
  /** `false`로 명시해야만 DB에 쓴다. 기본값은 미리보기 */
  apply?: boolean
  /** 대상 유저를 좁힐 때. 생략하면 `strava_connections`의 모든 유저 */
  userIds?: string[]
  /** Strava 요청 총량 상한 */
  requestBudget?: number
  /** 요청 사이 대기(ms) */
  requestDelayMs?: number
  /**
   * 갱신한 행에 백필 표시를 남길지. 기본 `true`.
   *
   * 표시는 `normalized.extendedBackfilledAt`(ISO 문자열)로 남기고 **`processed_via`는
   * 건드리지 않는다.** `processed_via`는 «이 행이 어떤 경로로 들어왔는가»(sync / reconcile)이지
   * «나중에 무엇으로 채워졌는가»가 아니다. 덮어쓰면 유입 경로 이력이 사라진다 —
   * 실측 2026-09-05 기준 `reconcile` 16행이 그 정보를 들고 있다(티켓 20260905_0029 개선 리뷰).
   */
  markBackfilled?: boolean
  /** 진행 로그 훅 (기본: console.info) */
  log?: (message: string) => void
}

export interface BackfillUserResult {
  userId: string
  /** Strava 목록에서 받은 활동 수 */
  fetched: number
  /** 그중 `strava_activities`에 실제로 있던 활동 수 */
  matched: number
  /** 확장 필드가 새로 붙거나 값이 달라져 갱신 대상이 된 행 수 */
  changed: number
  /** 실제로 DB에 쓴 행 수 (`apply: false`면 항상 0) */
  updated: number
  /** 사용한 Strava 요청 수 */
  requests: number
  /** 요청 예산이 바닥나 중간에 멈췄는지 */
  truncated: boolean
  /** 처리 실패 사유 (있으면 이 유저는 건너뛴 것) */
  error?: string
}

export interface BackfillSummary {
  apply: boolean
  users: BackfillUserResult[]
  totals: { fetched: number; matched: number; changed: number; updated: number; requests: number }
  /** 요청 예산이 바닥나 남은 유저를 처리하지 못했는지 — 그대로 다시 돌리면 이어진다 */
  truncated: boolean
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 저장된 `normalized`에 확장 6필드를 병합한다. **순수 함수** — 테스트가 이 함수를 직접 본다.
 *
 * - 확장 6필드 **외의 키는 읽지도 쓰지도 않는다**
 * - Strava가 값을 주지 않은 필드는 **키를 만들지 않는다**. 이미 저장된 값이 있으면 지우지도
 *   않는다 — 백필이 과거 데이터를 삭제하는 경로가 되면 안 된다
 * - 값이 이미 같으면 `changed: false`라 UPDATE를 보내지 않는다 (873행 재실행 비용 0)
 */
export function mergeExtendedFields(
  stored: unknown,
  summary: StravaSummaryActivity
): { normalized: Record<string, unknown>; changed: boolean } {
  const base: Record<string, unknown> =
    stored !== null && typeof stored === 'object' && !Array.isArray(stored)
      ? { ...(stored as Record<string, unknown>) }
      : {}

  const extended = extractExtendedActivityFields(summary) as Record<string, number | undefined>
  let changed = false
  for (const key of EXTENDED_ACTIVITY_FIELD_KEYS) {
    const next = extended[key]
    if (next === undefined) continue
    if (base[key] === next) continue
    base[key] = next
    changed = true
  }
  return { normalized: base, changed }
}

/**
 * 유저의 Strava access_token을 확보한다. 만료됐으면 갱신하고 **갱신분을 저장한다**.
 *
 * `syncStravaActivities`의 같은 구간을 공유하지 않는 이유는 그쪽이 백필에 있어선 안 되는 두
 * 가지를 함께 하기 때문이다 — ① 갱신 실패 시 유저에게 「Strava 연결 끊김」 소식을 보내고
 * ② `last_synced_at` 낙관적 잠금을 선점한다. 백필은 유저에게 보이지 않아야 하고 커서를
 * 건드려서도 안 된다.
 *
 * 저장은 생략할 수 없다 — Strava는 refresh_token을 회전시키므로, 갱신해 놓고 저장하지 않으면
 * 다음 싱크에서 유저의 연동이 끊긴다.
 */
async function resolveAccessToken(
  supabase: SupabaseClient,
  connection: StravaConnectionRow
): Promise<string> {
  const accessToken = await decrypt(connection.access_token)
  const expiresAt = new Date(connection.token_expires_at).getTime()
  if (Date.now() < expiresAt - 60_000) return accessToken

  const refreshToken = await decrypt(connection.refresh_token)
  const refreshed = await refreshStravaToken(refreshToken)
  const [encAccess, encRefresh] = await Promise.all([
    encrypt(refreshed.access_token),
    encrypt(refreshed.refresh_token),
  ])
  const { error } = await supabase
    .from('strava_connections')
    .update({
      access_token: encAccess,
      refresh_token: encRefresh,
      token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq('user_id', connection.user_id)
  if (error) {
    // 저장 실패를 무시하면 회전된 refresh_token이 유실돼 유저 연동이 끊긴다 — 중단한다
    throw new Error(`갱신된 토큰 저장 실패 (userId: ${connection.user_id}): ${error.message}`)
  }
  return refreshed.access_token
}

/** 유저의 `strava_activities` 전체를 읽는다 (PostgREST 기본 상한을 넘길 수 있으므로 페이지 분할) */
async function fetchStoredActivities(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; strava_id: number; normalized: unknown }[]> {
  const rows: { id: string; strava_id: number; normalized: unknown }[] = []
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('strava_activities')
      .select('id, strava_id, normalized')
      .eq('user_id', userId)
      .order('start_date', { ascending: true })
      .range(offset, offset + DB_PAGE_SIZE - 1)
    if (error) throw new Error(`strava_activities 조회 실패: ${error.message}`)
    const page = (data ?? []) as { id: string; strava_id: number; normalized: unknown }[]
    rows.push(...page)
    if (page.length < DB_PAGE_SIZE) break
  }
  return rows
}

/** 유저 1명의 확장 필드 백필 */
export async function backfillUserExtendedFields(
  supabase: SupabaseClient,
  connection: StravaConnectionRow,
  options: BackfillOptions & { requestBudget: number }
): Promise<BackfillUserResult> {
  const userId = connection.user_id
  const log = options.log ?? ((m: string) => console.info(m))
  const apply = options.apply === true
  const delayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS
  const markBackfilled = options.markBackfilled !== false

  const result: BackfillUserResult = {
    userId,
    fetched: 0,
    matched: 0,
    changed: 0,
    updated: 0,
    requests: 0,
    truncated: false,
  }

  let accessToken: string
  try {
    accessToken = await resolveAccessToken(supabase, connection)
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }

  // ① Strava 목록 전체 훑기 (상세 엔드포인트를 쓰지 않는다)
  const summaryById = new Map<number, StravaSummaryActivity>()
  try {
    for (let page = 1; page <= MAX_PAGES_PER_USER; page++) {
      if (result.requests >= options.requestBudget) {
        result.truncated = true
        break
      }
      if (page > 1 && delayMs > 0) await sleep(delayMs)
      const batch = await getActivities(accessToken, undefined, page)
      result.requests++
      for (const activity of batch) summaryById.set(activity.id, activity)
      if (batch.length < ACTIVITIES_PAGE_SIZE) break
      if (page === MAX_PAGES_PER_USER) result.truncated = true
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }
  result.fetched = summaryById.size

  // ② 저장된 활동과 대조해 확장 필드만 병합
  let stored: { id: string; strava_id: number; normalized: unknown }[]
  try {
    stored = await fetchStoredActivities(supabase, userId)
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }

  const updates: { id: string; normalized: Record<string, unknown> }[] = []
  for (const row of stored) {
    const summary = summaryById.get(row.strava_id)
    if (!summary) continue // Strava에서 삭제됐거나 이번 페이지 범위 밖 — 남겨 둔다
    result.matched++
    const { normalized, changed } = mergeExtendedFields(row.normalized, summary)
    if (!changed) continue
    updates.push({ id: row.id, normalized })
  }
  result.changed = updates.length

  log(
    `[backfill] userId=${userId} Strava ${result.fetched}건 · 저장분 ${stored.length}건 · ` +
      `대조 ${result.matched}건 · 갱신 대상 ${result.changed}건 (요청 ${result.requests}회)`
  )

  if (!apply) return result

  // ③ 쓰기 — `normalized` **한 컬럼만** 건드린다.
  //    배지·드랍·미션·소식은 어느 것도 호출하지 않는다.
  for (const update of updates) {
    const normalized = markBackfilled
      ? { ...update.normalized, extendedBackfilledAt: new Date().toISOString() }
      : update.normalized
    const payload: Record<string, unknown> = { normalized }
    const { error } = await supabase.from('strava_activities').update(payload).eq('id', update.id)
    if (error) {
      log(`[backfill] 갱신 실패 (id: ${update.id}): ${error.message}`)
      continue
    }
    result.updated++
  }
  return result
}

/**
 * 대상 유저 전체의 확장 필드 백필.
 *
 * 기본값이 **미리보기**(`apply: false`)다 — 쓰기는 호출자가 명시해야 한다.
 * 멱등이라 중단 후 그대로 다시 돌리면 이어진다.
 */
export async function backfillExtendedFields(
  supabase: SupabaseClient,
  options: BackfillOptions = {}
): Promise<BackfillSummary> {
  const log = options.log ?? ((m: string) => console.info(m))
  const apply = options.apply === true
  const budget = options.requestBudget ?? DEFAULT_REQUEST_BUDGET

  let query = supabase.from('strava_connections').select('*')
  if (options.userIds && options.userIds.length > 0) {
    query = query.in('user_id', options.userIds)
  }
  const { data, error } = await query
  if (error) throw new Error(`strava_connections 조회 실패: ${error.message}`)
  const connections = (data ?? []) as StravaConnectionRow[]

  log(`[backfill] 대상 유저 ${connections.length}명 · ${apply ? '실제 적용' : '미리보기'}`)

  const users: BackfillUserResult[] = []
  let spent = 0
  let truncated = false
  for (const connection of connections) {
    if (spent >= budget) {
      truncated = true
      log('[backfill] 요청 예산 소진 — 남은 유저는 다음 실행에서 이어집니다')
      break
    }
    const result = await backfillUserExtendedFields(supabase, connection, {
      ...options,
      requestBudget: budget - spent,
    })
    spent += result.requests
    if (result.truncated) truncated = true
    if (result.error) log(`[backfill] userId=${result.userId} 건너뜀 — ${result.error}`)
    users.push(result)
  }

  const totals = users.reduce(
    (acc, u) => ({
      fetched: acc.fetched + u.fetched,
      matched: acc.matched + u.matched,
      changed: acc.changed + u.changed,
      updated: acc.updated + u.updated,
      requests: acc.requests + u.requests,
    }),
    { fetched: 0, matched: 0, changed: 0, updated: 0, requests: 0 }
  )

  return { apply, users, totals, truncated }
}
