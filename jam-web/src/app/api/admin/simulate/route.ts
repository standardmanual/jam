import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { evaluateBadgesDetailed } from '@/lib/badge-engine'
import { buildVirtualActivities, readExtendedFields } from '@/lib/admin/virtualActivity'
import { previewItemDrop, type SkippedDropReason } from '@/lib/drop-engine/preview'
import type { Database } from '@/types/database.generated'

/**
 * `inventory_items.serial_number`는 NOT NULL인데 DEFAULT가 없어(migrations/034) 생성 타입이
 * Insert 필수 컬럼으로 잡지만, 실제 값은 BEFORE INSERT 트리거 `assign_random_serial()`
 * (migrations/108)이 채운다. 이 한 컬럼만 `Omit`으로 떼어내고 나머지 컬럼은 이름·타입 검사를
 * 그대로 받게 둔다 — 억제(`@ts-expect-error`)로 덮으면 컬럼명 오타까지 같이 통과한다
 * (티켓 20260831_1213).
 */
type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert']
type InventoryItemInsertByTrigger = Omit<InventoryItemInsert, 'serial_number'>

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
    ? await supabase.from('badges').select('id, name, rarity, type').in('id', poiBadgeIds).is('deleted_at', null)
    : { data: [] as { id: string; name: string; rarity: string; type: string }[] }
  const poiBadgesById = new Map((poiBadgesRaw ?? []).map((b) => [b.id, b]))

  for (const poi of matchedPois) {
    if (!poi.linked_badge_id) continue
    if (earnedBadgeIds.has(poi.linked_badge_id)) continue
    const badge = poiBadgesById.get(poi.linked_badge_id)
    if (badge) {
      badgesEarned.push({ id: badge.id, name: badge.name, rarity: badge.rarity, reason: `장소 통과: ${poi.name}` })
      earnedBadgeIds.add(badge.id)
      if (!dryRun) {
        // checkin 타입 배지(POI 연결 배지는 항상 이 타입)는 반복 획득 이력 테이블에 기록한다.
        // 정상 체크인 경로(src/lib/strava/sync.ts)와 동일한 테이블로 맞춰야 badges/page.tsx의
        // 활동 탭·체크인 탭이 서로 새지 않는다 (티켓 20260906_2023).
        if (badge.type === 'checkin') {
          const checkinBadgeEarnsQuery = supabase.from('user_checkin_badge_earns')
          await checkinBadgeEarnsQuery.insert({
            user_id: userId,
            badge_id: badge.id,
            poi_id: poi.id,
            triggered_by_activity_name: 'admin_simulate',
          })
        } else {
          const userActivityBadgesQuery = supabase.from('user_activity_badges')
          await userActivityBadgesQuery.insert({ user_id: userId, badge_id: badge.id, triggered_by: 'admin_simulate' })
        }
      }
    }
  }

  // 4. 아이템 드랍 시뮬레이션 — 엔진(`tryItemDrop`)의 판정 단계를 그대로 따라간다(`previewItemDrop`).
  //    첫 번째 활동 기준으로 한 번 굴리며, 현재 drop_policy·유저 드랍 상태·섀도우밴 수준을 읽는다.
  //    DB에는 아무것도 쓰지 않는다. 적용 모드(dryRun=false)만 고른 배지를 인벤토리에 넣고,
  //    유저 드랍 상태(연속 common·pity·일일 카운터)·결산 소식·엔진 판정 로그는 남기지 않는다.
  const itemDrops: {
    badgeName: string
    /** 실제로 뽑힌 배지의 등급 — 등급 폴백(후보 없음)이 일어나면 cappedRarity와 다를 수 있다 */
    rarity: string | null
    rolledRarity: string
    cappedRarity: string
    tribeName: string
    bookName: string
    isBonus: boolean
    isLastPiece: boolean
  }[] = []
  let itemDropSkips: { attempt: number; reason: SkippedDropReason; rolledRarity: string | null }[] = []
  let itemDropUnavailable: 'no_drop_structure' | 'no_inventory' | null = null

  const preview = await previewItemDrop(userId, activities[0] ?? null, activities)
  if (preview.kind === 'unavailable') {
    itemDropUnavailable = preview.reason
  } else {
    const { plan, inventory } = preview
    itemDropSkips = plan.skipped.map((skip) => ({
      attempt: skip.attempt,
      reason: skip.reason,
      rolledRarity: skip.rolledRarity ?? null,
    }))

    const bookIds = [...new Set(plan.drops.map((d) => d.bookId))]
    const { data: booksRaw } = bookIds.length > 0
      ? await supabase.from('item_books').select('id, name').in('id', bookIds)
      : { data: [] as { id: string; name: string }[] }
    const bookNameById = new Map((booksRaw ?? []).map((b) => [b.id, b.name]))

    let insertedCount = 0
    for (const drop of plan.drops) {
      itemDrops.push({
        badgeName: drop.badge.name,
        rarity: drop.badge.rarity,
        rolledRarity: drop.rolledRarity,
        cappedRarity: drop.cappedRarity,
        tribeName: drop.tribeName,
        bookName: bookNameById.get(drop.bookId) ?? '',
        isBonus: drop.isBonus,
        isLastPiece: drop.isLastPiece,
      })

      if (!dryRun) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const inventoryItemsQuery = supabase.from('inventory_items')
        const insertQuery = inventoryItemsQuery.insert({
          inventory_id: inventory.id,
          badge_id: drop.badge.id,
          obtained_by: 'drop',
          expires_at: expiresAt,
        } satisfies InventoryItemInsertByTrigger as InventoryItemInsert)
        const { data: insertedItem } = await insertQuery.select('id').single()

        if (insertedItem) {
          insertedCount += 1
          await supabase
            .from('inventory')
            .update({ used_slots: inventory.used_slots + insertedCount })
            .eq('id', inventory.id)
        }
      }
    }
  }

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
    itemDrops,
    itemDropSkips,
    itemDropUnavailable,
    itemBooksCompleted,
    applied: !dryRun,
  })
}
