/**
 * JAM! 투데이 홈 "오늘의 현황" 스트립 데이터 조회 (서버 사이드 전용) — 티켓 20260830_2030
 *
 * 좌 슬롯(내 진행도)·우 슬롯(친구 활동)의 상태를 계산한다. `today_cards` CMS와 역할이
 * 겹치지 않도록 **큐레이션(콘텐츠 선택)을 하지 않는다** — 신규 유저 안내는 코드에 정적으로
 * 박아둔 후보 풀에서 매 요청마다 랜덤 1개만 고른다(어드민 편집 대상 아님).
 *
 * 좌 슬롯 "진행 중" 판정은 `jam-web/src/lib/today/exposure.ts`의
 * `hasParticipatingMission`/`hasIncompleteItemBook`과 동일한 조회 패턴을 재사용한다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionCondition, MissionType } from '@/types/database'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import { d } from '@/lib/i18n'
import { getDisplayName } from '@/lib/utils'

// ─── 좌: 내 진행도 ──────────────────────────────────────────────────────

export type TodayLeftStatus =
  | { kind: 'strava_disconnected'; href: string }
  | { kind: 'progress'; name: string; current: number; total: number; missionType: MissionType | null; href: string }
  | { kind: 'suggestion'; text: string; category: 'drops' | 'missions'; href: string }

interface ProgressCandidate {
  name: string
  current: number
  total: number
  /** 거리(distance) 미션이면 소수 1자리 표시 — 아이템북 진행도(항상 정수)는 null.
   * 티켓 20260902_0933: 화면 간 표시 자릿수를 formatMissionProgress()로 통일하기 위한 힌트. */
  missionType: MissionType | null
  /** 완성도 동률 시 최근 활동순 정렬용 (epoch ms) */
  lastActivityAt: number
  href: string
}

/** 미션 타입별 목표치 — MissionDetailClient.missionGoalText()의 target 계산만 축약 재사용 */
function missionTarget(type: MissionType, condition: MissionCondition): number {
  switch (type) {
    case 'distance': return condition.distance_km ?? 0
    case 'activity_count': return condition.count ?? 0
    case 'checkin': return 1
    case 'item_collect': return 1
    case 'streak_days': return condition.streak_days ?? 0
    case 'duration_minutes': return condition.duration_minutes ?? 0
    case 'elevation_gain_m': return condition.elevation_gain_m ?? 0
    default: return 0
  }
}

/** 진행 중(슬롯 일부만 채운) 아이템북 후보 — exposure.ts의 hasIncompleteItemBook과 동일 패턴 */
async function collectionCandidates(userId: string): Promise<ProgressCandidate[]> {
  const supabase = createServiceClient()

  const { data: slotsRaw } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id, slotted_at')
    .eq('user_id', userId)
  const slots = (slotsRaw ?? []) as { item_book_id: string; slotted_at: string }[]
  if (slots.length === 0) return []

  const filledByBook = new Map<string, number>()
  const lastByBook = new Map<string, number>()
  for (const s of slots) {
    filledByBook.set(s.item_book_id, (filledByBook.get(s.item_book_id) ?? 0) + 1)
    const t = new Date(s.slotted_at).getTime()
    lastByBook.set(s.item_book_id, Math.max(lastByBook.get(s.item_book_id) ?? 0, t))
  }
  const startedIds = [...filledByBook.keys()]

  const { data: compsRaw } = await supabase
    .from('user_item_book_completions')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', startedIds)
  const completedBooks = new Set(((compsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id))
  const candidateIds = startedIds.filter((id) => !completedBooks.has(id))
  if (candidateIds.length === 0) return []

  const { data: booksRaw } = await supabase
    .from('item_books')
    .select('id, name')
    .in('id', candidateIds)
    .eq('is_active', true)
  const books = (booksRaw ?? []) as { id: string; name: string }[]
  if (books.length === 0) return []
  const bookIds = books.map((b) => b.id)

  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id')
    .in('item_book_id', bookIds)
    .eq('type', 'item')
    .is('deleted_at', null)
  const totalByBook = new Map<string, number>()
  for (const b of (badgesRaw ?? []) as { id: string; item_book_id: string | null }[]) {
    if (!b.item_book_id) continue
    totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
  }

  const result: ProgressCandidate[] = []
  for (const book of books) {
    const total = totalByBook.get(book.id) ?? 0
    const filled = filledByBook.get(book.id) ?? 0
    if (total > 0 && filled < total) {
      result.push({
        name: book.name,
        current: filled,
        total,
        missionType: null,
        lastActivityAt: lastByBook.get(book.id) ?? 0,
        href: `/collections/${book.id}`,
      })
    }
  }
  return result
}

/** 진행 중(참가했으나 미완료) 미션 후보 — exposure.ts의 hasParticipatingMission과 동일 패턴 */
async function missionCandidates(userId: string): Promise<ProgressCandidate[]> {
  const supabase = createServiceClient()

  const { data: partsRaw } = await supabase
    .from('user_mission_participations')
    .select('mission_id, joined_at, progress_value')
    .eq('user_id', userId)
  const parts = (partsRaw ?? []) as { mission_id: string; joined_at: string; progress_value: number }[]
  if (parts.length === 0) return []
  const participatingIds = parts.map((p) => p.mission_id)

  const { data: compsRaw } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)
    .in('mission_id', participatingIds)
  const completedIds = new Set(((compsRaw ?? []) as { mission_id: string }[]).map((c) => c.mission_id))
  const incomplete = parts.filter((p) => !completedIds.has(p.mission_id))
  if (incomplete.length === 0) return []

  const { data: missionsRaw } = await supabase
    .from('missions')
    .select('id, title, mission_type, condition_json')
    .in('id', incomplete.map((p) => p.mission_id))
  const missionMap = new Map(
    ((missionsRaw ?? []) as { id: string; title: string; mission_type: MissionType; condition_json: MissionCondition }[])
      .map((m) => [m.id, m])
  )

  const result: ProgressCandidate[] = []
  for (const p of incomplete) {
    const mission = missionMap.get(p.mission_id)
    if (!mission) continue
    const total = missionTarget(mission.mission_type, mission.condition_json)
    if (total <= 0) continue
    const current = Math.min(p.progress_value, total)
    if (current >= total) continue // 진행값이 이미 목표에 도달했으나 완료 처리가 안 된 경계 케이스는 제외
    result.push({
      name: mission.title,
      current,
      total,
      missionType: mission.mission_type,
      lastActivityAt: new Date(p.joined_at).getTime(),
      href: `/missions/${p.mission_id}`,
    })
  }
  return result
}

/**
 * 진행 중인 컬렉션/미션 중 완성도가 가장 높은 1건을 고른다.
 * 동률이면 최근 활동순(collectionCandidates는 최근 슬롯팅, missionCandidates는 참가 시각).
 */
async function bestProgress(userId: string): Promise<ProgressCandidate | null> {
  const [collections, missions] = await Promise.all([
    collectionCandidates(userId),
    missionCandidates(userId),
  ])
  const all = [...collections, ...missions]
  if (all.length === 0) return null

  all.sort((a, b) => {
    const pctA = a.current / a.total
    const pctB = b.current / b.total
    if (pctB !== pctA) return pctB - pctA
    return b.lastActivityAt - a.lastActivityAt
  })
  return all[0]
}

/** 신규 유저 정적 안내 후보 풀 — 큐레이션 아님, 어드민 편집 대상 아님(코드에 고정) */
const SUGGESTIONS: { text: string; category: 'drops' | 'missions'; href: string }[] = [
  { text: d.todayStatus.suggestionDrops, category: 'drops', href: '/drops' },
  { text: d.todayStatus.suggestionMissions, category: 'missions', href: '/missions' },
]

/**
 * 진행 중인 컬렉션/미션 → 없으면 신규 유저 안내를 계산한다.
 * Strava 연동 여부 판단은 이 함수의 책임이 아니다 — 호출부(`page.tsx`)가
 * `strava_connections` 조회로 먼저 확정하고, 미연동이면 이 함수 자체를 호출하지 않는다
 * (티켓 20260830_2104 — 미연동 유저에게 무의미한 DB 조회 4건이 실행되던 문제 제거).
 */
export async function getTodayLeftStatus(userId: string): Promise<TodayLeftStatus> {
  const best = await bestProgress(userId)
  if (best) {
    return { kind: 'progress', name: best.name, current: best.current, total: best.total, missionType: best.missionType, href: best.href }
  }

  // 페이지 로드 시점마다 1회 랜덤 선택 — 리롤 UI는 두지 않는다(정적 안내로 충분).
  const pick = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]
  return { kind: 'suggestion', text: pick.text, category: pick.category, href: pick.href }
}

// ─── 우: 친구 활동 ──────────────────────────────────────────────────────

export type TodayRightStatus =
  | { kind: 'no_following'; href: string }
  /** 팔로잉은 있으나 오늘 배지 획득 활동이 없음 — 슬롯 자체를 렌더링하지 않는다 */
  | { kind: 'none' }
  | { kind: 'friend_activity'; count: number; avatarUrls: (string | null)[]; href: string; singleFriendName: string | null }

/** KST 기준 오늘 00:00의 UTC ISO 시각 */
function kstTodayStartIso(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth()
  const day = kst.getUTCDate()
  return new Date(Date.UTC(y, m, day) - KST_OFFSET_MS).toISOString()
}

/** 아바타 스택에 노출할 최대 인원 */
const FRIEND_AVATAR_MAX = 3

/**
 * 친구 활동 카드의 탭 목적지를 계산한다 — 순수 함수(티켓 20260830_2107).
 * 오늘 배지를 획득한 팔로잉이 정확히 1명이고 username을 알 수 있으면 그 친구 프로필로,
 * 그 외(2명 이상 또는 username 조회 실패)에는 통합 피드(/feed)로 보낸다.
 */
export function resolveFriendActivityHref(count: number, singleUsername: string | null): string {
  if (count === 1 && singleUsername) return `/${singleUsername}`
  return '/feed'
}

export async function getTodayRightStatus(userId: string, now: Date = new Date()): Promise<TodayRightStatus> {
  const supabase = createServiceClient()

  const { data: followsRaw } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId)
  const followingIds = ((followsRaw ?? []) as { following_id: string }[]).map((f) => f.following_id)
  if (followingIds.length === 0) return { kind: 'no_following', href: '/search' }

  const todayStart = kstTodayStartIso(now)
  const { data: activityRaw } = await supabase
    .from('user_activity_feed')
    .select('user_id, created_at')
    .in('user_id', followingIds)
    .eq('event_type', 'badge_earned')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (activityRaw ?? []) as { user_id: string; created_at: string }[]
  const orderedUserIds: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!seen.has(r.user_id)) {
      seen.add(r.user_id)
      orderedUserIds.push(r.user_id)
    }
  }
  if (orderedUserIds.length === 0) return { kind: 'none' }

  const top = orderedUserIds.slice(0, FRIEND_AVATAR_MAX)
  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, avatar_url, username, display_name')
    .in('id', top)
  const userMap = new Map(
    (
      (usersRaw ?? []) as { id: string; avatar_url: string | null; username: string | null; display_name: string | null }[]
    ).map((u) => [u.id, u])
  )
  const avatarUrls = top.map((id) => userMap.get(id)?.avatar_url ?? null)

  const singleUser = orderedUserIds.length === 1 ? userMap.get(orderedUserIds[0]) ?? null : null
  const singleUsername = singleUser?.username ?? null
  const singleFriendName = singleUser ? getDisplayName(singleUser) || null : null
  const href = resolveFriendActivityHref(orderedUserIds.length, singleUsername)

  return { kind: 'friend_activity', count: orderedUserIds.length, avatarUrls, href, singleFriendName }
}
