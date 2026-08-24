/**
 * 알림(소식)함 조회 — 서버 사이드 전용 (티켓 20260824_021)
 * 스펙: Specs/PRD/Notification/PRD.md §6-1 / DATA_MODEL.md §3
 *
 * 화면(`/notifications`)과 API(`/api/notifications`)가 **같은 함수**를 쓴다. 첫 페이지는
 * 서버 컴포넌트가 그리고, "더 불러오기"만 API를 탄다 — 두 경로에서 조인·경고 판정이
 * 갈리지 않게 하기 위함이다.
 *
 * ## 여기서 하는 일 3가지
 *
 * 1. **커서 페이지네이션** — `updated_at DESC` 기준(`created_at`이 아니다. 묶음 갱신이
 *    리스트 순서에 즉시 반영돼야 한다). `listTransactions()`(포인트 내역)와 같은 패턴.
 * 2. **닉네임 조인** — `payload`에 박제하지 않으므로 `actor_user_id`·`user_id`로 렌더
 *    시점에 읽는다(닉네임을 바꾸면 과거 소식도 따라온다).
 * 3. **⑧ 경고 재평가** — 저장값이 아니라 지금 상태로 판정한다(warning.ts).
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { NotificationRow } from '@/types/database'
import { idList, type NotificationActor, type NotificationView } from './message'
import {
  WARNING_CANDIDATE_TYPES,
  isWarningNotification,
  type NotificationWarningState,
} from './warning'

/** 알림함 한 페이지 크기 */
export const NOTIFICATIONS_PAGE_SIZE = 20

export interface NotificationPage {
  items: NotificationView[]
  /** 다음 페이지 커서(마지막 항목의 updated_at). null이면 더 없음 */
  nextCursor: string | null
}

interface UserBrief {
  id: string
  username: string | null
  avatar_url: string | null
}

function toActor(row: UserBrief | undefined): NotificationActor | null {
  if (!row) return null
  return { id: row.id, username: row.username, avatarUrl: row.avatar_url }
}

/**
 * 소식 목록 (최신순, 커서 기반).
 *
 * 조회 실패는 예외를 던지지 않고 빈 페이지로 돌려준다 — 알림함이 비는 건 회복 가능한
 * 상태지만, 던지면 화면 전체가 500이 된다. 로그는 반드시 남긴다.
 */
export async function listNotificationViews(
  userId: string,
  cursor?: string | null,
  limit: number = NOTIFICATIONS_PAGE_SIZE
): Promise<NotificationPage> {
  const supabase = createServiceClient()

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) query = query.lt('updated_at', cursor)

  const { data, error } = await query
  if (error) {
    console.error(`[notifications] 목록 조회 실패 — userId: ${userId}:`, error)
    return { items: [], nextCursor: null }
  }

  const all = (data ?? []) as NotificationRow[]
  const hasMore = all.length > limit
  const rows = hasMore ? all.slice(0, limit) : all
  const nextCursor = hasMore ? rows[rows.length - 1].updated_at : null

  const items = await hydrateNotifications(userId, rows)
  return { items, nextCursor }
}

/**
 * 행 → 화면이 그릴 수 있는 뷰 모델.
 *
 * 유저 조인은 페이지 단위 일괄 조회 1회(N+1 금지), 경고 상태 조회는 **해당 종류가
 * 이 페이지에 실제로 있을 때만** 수행한다.
 */
export async function hydrateNotifications(
  userId: string,
  rows: NotificationRow[]
): Promise<NotificationView[]> {
  if (rows.length === 0) return []

  const supabase = createServiceClient()

  // ── 1) 조인 대상 유저 수집 (본인 + 대표 행위자 + 2명 나열용 두 번째 행위자) ──
  const userIds = new Set<string>([userId])
  const secondActorByRow = new Map<string, string>()
  for (const row of rows) {
    if (row.actor_user_id) userIds.add(row.actor_user_id)
    const actorIds = idList(row.payload, 'actor_ids')
    const second = actorIds.find((id) => id !== row.actor_user_id)
    if (second) {
      secondActorByRow.set(row.id, second)
      userIds.add(second)
    }
  }

  // ── 2) 경고 판정에 필요한 상태 — 필요한 종류가 있을 때만 조회 ──
  const types = new Set(rows.map((r) => r.type))
  const needsStrava = types.has('strava_disconnected') || types.has('sync_stalled')
  const needsInventory = types.has('inventory_full')
  const hasWarningCandidate = rows.some((r) => WARNING_CANDIDATE_TYPES.has(r.type))

  const [usersRes, stravaRes, inventoryRes] = await Promise.all([
    supabase.from('users').select('id, username, avatar_url').in('id', [...userIds]),
    needsStrava
      ? supabase
          .from('strava_connections')
          .select('user_id, last_synced_at')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    needsInventory
      ? supabase
          .from('inventory')
          .select('used_slots, max_slots')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const userById = new Map<string, UserBrief>(
    ((usersRes.data ?? []) as UserBrief[]).map((u) => [u.id, u])
  )

  const warningState: NotificationWarningState = {}
  if (needsStrava) {
    const conn = stravaRes.data as { user_id: string; last_synced_at: string | null } | null
    warningState.stravaConnected = Boolean(conn)
    warningState.lastSyncedAt = conn?.last_synced_at ?? null
  }
  if (needsInventory) {
    const inv = inventoryRes.data as { used_slots: number; max_slots: number } | null
    if (inv) warningState.inventoryRemainingSlots = Math.max(0, inv.max_slots - inv.used_slots)
  }

  // 목록 전체가 같은 시점으로 판정되도록 한 번만 캡처한다
  const now = new Date()
  const me = toActor(userById.get(userId)) ?? { id: userId, username: null, avatarUrl: null }

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload ?? {},
    actorCount: row.actor_count,
    actor: row.actor_user_id ? toActor(userById.get(row.actor_user_id)) : null,
    actor2: toActor(userById.get(secondActorByRow.get(row.id) ?? '')),
    me,
    updatedAt: row.updated_at,
    warning: hasWarningCandidate
      ? isWarningNotification(row.type, row.payload ?? {}, warningState, now)
      : false,
  }))
}

/**
 * 진입 직전의 `notifications_seen_at` **스냅샷**.
 *
 * 진입하면 전체 읽음 처리하므로, 그 전 값을 잡아 두지 않으면 유저는 뭐가 새 거였는지
 * 알 수 없다. 이 값으로 그 페이지에서만 "새 소식 N" 구분선을 그린다.
 */
export async function getSeenAt(userId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('notifications_seen_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error(`[notifications] seen_at 조회 실패 — userId: ${userId}:`, error)
    return null
  }
  return (data as { notifications_seen_at: string | null } | null)?.notifications_seen_at ?? null
}

/**
 * 전체 읽음 처리 — 유저당 **항상 1행 UPDATE**다.
 * 개별 read 플래그를 두지 않기로 한 결정(DATA_MODEL §3)이 이 한 줄로 끝난다.
 */
export async function markNotificationsSeen(userId: string): Promise<boolean> {
  const supabase = createServiceClient()
  // 좁은 캐스팅 — 리포 전역의 Supabase Update 타입 추론 제한(never) 우회.
  // `@ts-expect-error`로 덮으면 원인이 해소되는 순간 그 주석 줄이 컴파일 오류가 된다.
  const table = supabase.from('users') as unknown as {
    update: (values: { notifications_seen_at: string }) => {
      eq: (column: 'id', value: string) => PromiseLike<{ error: { message: string } | null }>
    }
  }

  const { error } = await table
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) {
    console.error(`[notifications] 읽음 처리 실패 — userId: ${userId}:`, error)
    return false
  }
  return true
}

/**
 * dot 판정용 — `bumps_badge=true`인 **가장 최근** 소식의 `updated_at` (DATA_MODEL §3).
 *
 * EXISTS 서브쿼리 대신 최신 1건을 읽어 JS에서 비교한다. seen_at 조회와 **병렬로 돌 수
 * 있어** (main) 레이아웃에 왕복 지연을 더하지 않기 때문이다
 * (`(user_id, updated_at DESC)` 인덱스를 그대로 탄다).
 */
export async function latestBumpingNotificationAt(userId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('updated_at')
    .eq('user_id', userId)
    .eq('bumps_badge', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(`[notifications] dot 판정 실패 — userId: ${userId}:`, error)
    return null
  }
  return (data as { updated_at: string } | null)?.updated_at ?? null
}

/**
 * 안 읽은 소식이 있는가. `seen_at`이 NULL인 신규 유저는 모든 소식이 안 읽음이다
 * (DATA_MODEL §3의 `COALESCE(..., '-infinity')`에 해당).
 */
export function hasUnread(latestBumpingAt: string | null, seenAt: string | null): boolean {
  if (!latestBumpingAt) return false
  if (!seenAt) return true
  // 문자열 비교는 소수점 자릿수 차이에 흔들리므로 시각으로 비교한다
  return new Date(latestBumpingAt).getTime() > new Date(seenAt).getTime()
}
