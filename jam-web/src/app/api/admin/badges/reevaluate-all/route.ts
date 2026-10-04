/**
 * 카탈로그 시딩 후 기존 유저 일괄 재평가 — 어드민 전용 (티켓 20260906_1431)
 *
 * ## 실행 시점 — 「카탈로그 시딩과 항상 짝지어 실행하는 절차」
 * 자동 트리거가 아니다. 카탈로그에 배지를 새로 시딩할 때마다 오케스트레이터/운영자가
 * **매번 직접 호출**한다. 절차·근거는 `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md` §2.17.
 *
 * ## dry-run이 기본값이다
 * 대량 발급은 되돌리기 어렵다(포인트 지급까지 딸려 온다). `dryRun`을 명시적으로
 * `false`로 보내야만 실제로 DB에 반영된다 — 실수로 전체 유저에게 즉시 발급되는 사고를
 * 막기 위한 안전장치다.
 *
 * ## JAM! 행동 지표도 포함한다 (티켓 20261001_0634)
 * 메인 엔진 평가 뒤에 JAM! 행동 지표(믹스·드랍·픽업·미션·컬렉션·가입 경과일·활동일 등)까지 같이 돌린다.
 * 응답의 `jamActionAffectedUserCount`·`totalJamActionBadgesIssued`·`totalJamActionPointsAwarded`가
 * 그 몫만 따로 보여 준다(위 합계에는 이미 포함돼 있다).
 *
 * ## 사용량 지표 6종도 포함한다 (티켓 20261001_1022)
 * 팔로워·팔로잉·동기화 횟수·연속 동기화·체크인 카테고리·체크인 목록 지표도 JAM! 다음에 돌린다. 동기화 2종은
 * 오늘이 아니라 과거 기록 기준이다. 응답의 `usageMetricAffectedUserCount`·`totalUsageMetricBadgesIssued`·
 * `totalUsageMetricPointsAwarded`가 그 몫을 따로 보여 준다(위 합계에는 이미 포함돼 있다).
 *
 * ## 「열릴 예정 배지 포함」 미리보기 (티켓 20261001_2203)
 * body에 `includeUpcoming: true`(선택 `badgeIds`)를 보내면 `valid_from`이 미래인 JAM! 배지까지 «공개되면 받게 될 유저 수·포인트»를
 * 센다(`previewUpcomingJamBadges`). 읽기 전용이라 `dryRun: false`와 함께 보내면 400이다. 응답 모양이 위와 달라
 * `badges[]`(배지별 유저 수·포인트)·`totalPoints`·`errors[]`를 준다. 숫자는 지금 기록 기준이라 «약»이다.
 * 대상 유저 500명 상한은 그대로다. 예약 등록 요약창(1500 ⑨)은 이 라우트가 아니라 서버 함수를 직접 부른다.
 *
 * ## 로직은 여기 없다
 * 평가·집계는 전부 `reevaluateUsersForCatalog`(`@/lib/badge-engine/reevaluateCatalog`)에
 * 있다. 이 라우트는 인증·입력 검증·대상 유저 조회·상한 체크만 한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  reevaluateUsersForCatalog,
  previewUpcomingJamBadges,
  MAX_TARGET_USERS_PER_CALL,
} from '@/lib/badge-engine/reevaluateCatalog'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)

  // 기본값 true — 명시적으로 false를 보내야만 실제 발급된다 (전체 유저 대상 실수 방지)
  const dryRun = body?.dryRun !== false

  // 열릴 예정 배지 미리보기 — 읽기 전용이라 dryRun:false와 같이 보낼 수 없다
  const includeUpcoming = body?.includeUpcoming === true
  if (includeUpcoming && body?.dryRun === false) {
    return NextResponse.json({ error: 'includeUpcoming은 미리보기 전용이라 dryRun: false와 함께 보낼 수 없습니다.' }, { status: 400 })
  }
  const rawBadgeIds = body?.badgeIds
  if (rawBadgeIds !== undefined && (!Array.isArray(rawBadgeIds) || rawBadgeIds.some((v: unknown) => typeof v !== 'string' || !v.trim()))) {
    return NextResponse.json({ error: 'badgeIds는 문자열 배열이어야 합니다.' }, { status: 400 })
  }

  const rawUserIds = body?.userIds
  if (rawUserIds !== undefined && (!Array.isArray(rawUserIds) || rawUserIds.some((v: unknown) => typeof v !== 'string' || !v.trim()))) {
    return NextResponse.json({ error: 'userIds는 문자열 배열이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let targetUserIds: string[]
  if (Array.isArray(rawUserIds) && rawUserIds.length > 0) {
    targetUserIds = Array.from(new Set(rawUserIds as string[]))
  } else {
    const { data, error } = await supabase.from('users').select('id')
    if (error) {
      console.error('[/api/admin/badges/reevaluate-all] 전체 유저 조회 오류:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    targetUserIds = ((data ?? []) as { id: string }[]).map((u) => u.id)
  }

  if (targetUserIds.length === 0 && !includeUpcoming) {
    return NextResponse.json({
      dryRun,
      targetUserCount: 0,
      affectedUserCount: 0,
      totalBadgesIssued: 0,
      totalPointsAwarded: 0,
      totalCounterIncrements: 0,
      jamActionAffectedUserCount: 0,
      totalJamActionBadgesIssued: 0,
      totalJamActionPointsAwarded: 0,
      usageMetricAffectedUserCount: 0,
      totalUsageMetricBadgesIssued: 0,
      totalUsageMetricPointsAwarded: 0,
      users: [],
    })
  }

  if (targetUserIds.length > MAX_TARGET_USERS_PER_CALL) {
    return NextResponse.json(
      {
        error: `대상 유저가 ${targetUserIds.length}명이라 한 번에 처리할 수 없습니다 (상한 ${MAX_TARGET_USERS_PER_CALL}명). userIds로 나눠서 여러 번 호출해 주세요.`,
      },
      { status: 400 }
    )
  }

  if (includeUpcoming) {
    try {
      const preview = await previewUpcomingJamBadges(supabase, {
        userIds: targetUserIds,
        badgeIds: rawBadgeIds as string[] | undefined,
      })
      return NextResponse.json({ dryRun: true, includeUpcoming: true, ...preview })
    } catch (err) {
      console.error('[/api/admin/badges/reevaluate-all] 열릴 예정 배지 미리보기 오류:', err)
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  const result = await reevaluateUsersForCatalog(supabase, { dryRun, userIds: targetUserIds })
  return NextResponse.json(result)
}
