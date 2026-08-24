/**
 * 최근 획득 배지 조회 API (20260824_003)
 * GET /api/badges/recent-earned
 *
 * 최초 Strava 연동 콜백(`/api/strava/callback`)은 동기화를 끝낸 **직후 리다이렉트**하므로
 * 응답 본문에 획득 배지를 실을 수 없다. 도착 페이지가 이 API로 방금 받은 배지를 되읽어
 * 획득 연출(BadgeRevealCarousel)을 띄운다.
 *
 * 🔴 판정 기준은 `created_at`이다 — `event_at`이 아니다.
 * `user_activity_feed.event_at`에는 **Strava 활동 시작 시각**이 들어간다(recordFeedEvent의
 * 4번째 인자). 프로덕션 실측에서 badge_earned 23건 중 실제 삽입 시각과 10분 이내인 건이
 * 0/23이었고, 편차는 -5,204분 ~ +159분이었다. 게다가 `startDateLocal`이 로컬 벽시계에 Z를
 * 붙인 값이라 KST 사용자는 event_at이 최대 +9시간 미래로 찍혀 오검출까지 난다.
 * 기록 시각 컬럼(`created_at`)은 **마이그레이션 093**에서 추가한다 — 그 전에는 이 조회가
 * 컬럼 없음 오류로 빈 결과를 돌려주고 연출만 생략된다(화면은 정상 동작).
 *
 * 상세 상한(10건)과 잔여 개수 계산은 `/api/strava/sync`와 동일하게
 * `buildEarnedBadgePayload()` 한 곳에서만 처리한다.
 *
 * 응답:
 *   200 { earnedBadges: EarnedBadgeSummary[], earnedBadgesMore: number }
 *   401 { error: '인증이 필요합니다.' }
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildEarnedBadgePayload } from '@/lib/strava/sync'
import type { ActivityFeedEventType } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * "방금 획득"으로 인정하는 시간 창.
 * 콜백은 동기화를 await한 뒤 리다이렉트하므로(첫 싱크는 최대 60초까지 걸릴 수 있다)
 * 도착 시점 기준으로 배지 기록은 수 초~1분 전이다. 리다이렉트·페이지 로드 지연까지 감안해
 * 10분으로 둔다. 그 이상 지난 획득은 "지금 막 받은 것"이 아니므로 연출 대상이 아니다.
 */
const RECENT_WINDOW_MS = 10 * 60 * 1000

/** 시간 창 안에서 훑을 피드 이벤트 수 상한 (상세 상한 10건보다 넉넉하게) */
const FEED_SCAN_LIMIT = 50

/**
 * 싱크가 만들어내는 "배지 획득" 이벤트 두 종류.
 * - badge_earned: 액티비티배지 / POI 배지 / 컬렉션·미션 보상배지
 * - item_dropped: 아이템배지 드랍
 * item_picked_up(남이 드랍한 것 줍기)은 싱크가 만드는 이벤트가 아니라 제외한다.
 */
const EARNED_EVENT_TYPES: ActivityFeedEventType[] = ['badge_earned', 'item_dropped']

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const service = createServiceClient()
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString()

  const { data, error } = await service
    .from('user_activity_feed')
    .select('created_at, metadata')
    .eq('user_id', user.id)
    .in('event_type', EARNED_EVENT_TYPES)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(FEED_SCAN_LIMIT)

  if (error) {
    // 연출만 생략되고 화면은 정상 동작해야 하므로 에러 대신 빈 결과를 준다.
    // ⚠️ 마이그레이션 093 미적용 상태에서는 여기로 빠진다(42703 column does not exist).
    //    "최근 획득 없음"과 구분되도록 코드까지 남긴다 — 빈 배열을 정상으로 오독하지 않기 위함.
    console.error(`[/api/badges/recent-earned] 피드 조회 오류 (code: ${error.code}):`, error)
    return NextResponse.json({ earnedBadges: [], earnedBadgesMore: 0 })
  }

  // 피드는 최신순으로 읽었으므로 뒤집어 **획득 순서(오래된 → 최신)** 로 되돌린다.
  // 동기화 응답(`/api/strava/sync`)의 earnedBadges 순서와 같은 규칙이다.
  const rows = ((data ?? []) as { created_at: string; metadata: Record<string, unknown> }[])
    .slice()
    .reverse()
  const badgeIds: string[] = []
  for (const row of rows) {
    const id = row.metadata?.badge_id
    if (typeof id === 'string') badgeIds.push(id)
  }

  // 중복 제거·소프트 삭제 제외·상한 적용은 buildEarnedBadgePayload가 담당한다.
  const payload = await buildEarnedBadgePayload(service, badgeIds)
  return NextResponse.json(payload)
}
