import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { isActivityWithinBadgeWindow } from '@/lib/poi/checkin-window'
import { evaluateBadgesDetailed } from '@/lib/badge-engine'
import { buildVirtualActivities, readExtendedFields } from '@/lib/admin/virtualActivity'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { userId, dryRun, activity, repeatCount = 1, firstSync = false } = body

  if (!userId || !activity) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 가상 활동 배열 구성(repeatCount만큼 연속 날짜에 생성) — 시뮬레이터/시뮬레이션 API가 공유하는
  // 변환 로직으로 옮겼다(티켓 20260908_1631, `lib/admin/virtualActivity.ts`).
  const activities = buildVirtualActivities(activity, repeatCount)
  const extended = readExtendedFields(activity)

  // 1. 배지 평가 — badge-engine을 그대로 사용 (진행 트랙 dedup 포함)
  //    dryRun=true이면 평가만 수행, false이면 DB에도 저장됨
  //    silent=true: 시뮬레이션 결과는 피드에 기록하지 않음
  //    firstSync=true(첫 싱크 강제 시뮬레이션)면 게이트를 강제 적용하되(forceFirstSyncGate),
  //    dryRun=false로 실제 유저에게 적용하더라도 users.initial_sync_done은 건드리지 않는다
  //    (skipInitialSyncFlagUpdate) — 시뮬레이터가 실제 온보딩 상태를 오염시키면 안 된다.
  const { earned: badgesEarned, missed: badgesMissed } = await evaluateBadgesDetailed(
    userId,
    activities,
    {
      dryRun,
      triggeredBy: 'admin_simulate',
      silent: true,
      forceFirstSyncGate: firstSync || undefined,
      skipInitialSyncFlagUpdate: firstSync || undefined,
    }
  )

  // 2. 기존 보유 배지 조회 — POI 배지 중복 발급 방지에 사용
  const { data: ownedBadgesRaw } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)

  const ownedBadgeIds = new Set((ownedBadgesRaw ?? []).map((b: { badge_id: string }) => b.badge_id))
  const earnedBadgeIds = new Set([...ownedBadgeIds, ...badgesEarned.map((b) => b.id)])

  // 3. POI 매칭
  const route: Array<[number, number]> = activity.route ?? []
  const matchedPois = route.length > 0 ? await matchPoisForActivity(route, supabase) : []
  const poisMatched = matchedPois.map((p) => ({ id: p.id, name: p.name }))

  const poiBadgeIds = matchedPois.map((p) => p.linked_badge_id).filter(Boolean) as string[]
  const { data: poiBadgesRaw } = poiBadgeIds.length > 0
    ? await supabase.from('badges').select('id, name, rarity, type, valid_from, valid_until').in('id', poiBadgeIds).is('deleted_at', null)
    : { data: [] as { id: string; name: string; rarity: string; type: string; valid_from: string | null; valid_until: string | null }[] }
  // 공개 기간 밖의 POI 배지는 실제 동기화 경로(`lib/strava/sync.ts`)와 같은 판정(`isActivityWithinBadgeWindow`)으로
  // 획득 예정에 넣지 않고 dryRun=false여도 기록하지 않는다(스펙 §3.18, 티켓 20260930_0015). 기준 시각은 동기화와 같이
  // 활동 시작 시각이다 — 반복 횟수만큼 만든 가상 활동 중 마지막 것(입력한 시작 시각)을 쓴다.
  const activityStartDate = activities[activities.length - 1].startDate
  // 체크인이 아닌 타입의 POI 연결 배지는 건너뛴다 — 동기화(`lib/strava/sync.ts`의 `badge.type !== 'checkin'`이면 continue)와
  // 같은 판정이다. 장소 연결로는 체크인 배지만 발급하고(옛 `poi_match` 경로 삭제), 다른 타입에는 아무것도 하지 않는다.
  // 그래서 획득 예정에도 넣지 않고 dryRun=false여도 어떤 표에도 기록하지 않는다(티켓 20261026_1053). 장소 매칭(poisMatched)은 그대로 보인다.
  const poiBadgesById = new Map(
    (poiBadgesRaw ?? [])
      .filter((b) => b.type === 'checkin')
      .filter((b) => isActivityWithinBadgeWindow(activityStartDate, b.valid_from, b.valid_until))
      .map((b) => [b.id, b])
  )

  for (const poi of matchedPois) {
    if (!poi.linked_badge_id) continue
    if (earnedBadgeIds.has(poi.linked_badge_id)) continue
    const badge = poiBadgesById.get(poi.linked_badge_id)
    if (badge) {
      badgesEarned.push({ id: badge.id, name: badge.name, rarity: badge.rarity, reason: `장소 통과: ${poi.name}` })
      earnedBadgeIds.add(badge.id)
      if (!dryRun) {
        // 여기까지 온 배지는 위에서 걸러 낸 checkin 타입뿐이다. 반복 획득 이력 테이블에 기록한다.
        // 정상 체크인 경로(src/lib/strava/sync.ts)와 동일한 테이블로 맞춰야 badges/page.tsx의
        // 활동 탭·체크인 탭이 서로 새지 않는다 (티켓 20260906_2023).
        const checkinBadgeEarnsQuery = supabase.from('user_checkin_badge_earns')
        await checkinBadgeEarnsQuery.insert({
          user_id: userId,
          badge_id: badge.id,
          poi_id: poi.id,
          triggered_by_activity_name: 'admin_simulate',
        })
      }
    }
  }

  // 아이템 드랍 시뮬레이션은 없다 — 옛 드랍 엔진 미리 보기(`previewItemDrop`)를 지우면서 함께 지웠다(티켓 20261022_0938).
  // 새 발급 경로(`lib/drop-engine/syncIssue*.ts`)용 미리 보기는 필요해지면 별도 티켓으로 만든다.

  // Phase 8: 아이템북 완성은 유저가 직접 슬롯을 채우는 방식으로 변경됨.
  // 시뮬레이션으로는 슬롯 액션을 재현할 수 없으므로 완성 체크는 생략.
  const itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[] = []

  return NextResponse.json({
    parsed: {
      distanceKm: activity.distanceKm,
      durationMin: Math.round(activity.movingTimeSec / 60),
      elevationGainM: activity.elevationGainM,
      averageSpeedKmh: activity.averageSpeedKmh,
      trackpointCount: route.length,
      // 실제로 평가에 실린 확장 필드만 되돌려준다 — 입력이 무시됐는지 화면에서 바로 보인다
      extended,
    },
    badgesEarned,
    badgesMissed,
    poisMatched,
    itemBooksCompleted,
    applied: !dryRun,
  })
}
