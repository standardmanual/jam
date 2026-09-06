/**
 * 카탈로그 시딩 후 기존 유저 일괄 재평가 — 어드민 전용 (티켓 20260906_1431)
 *
 * ## 실행 시점 — 「카탈로그 시딩과 항상 짝지어 실행하는 절차」
 * 자동 트리거가 아니다. 카탈로그에 배지를 새로 시딩할 때마다 오케스트레이터/운영자가
 * **매번 직접 호출**한다. 절차·근거는 `Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` §2.17.
 *
 * ## dry-run이 기본값이다
 * 대량 발급은 되돌리기 어렵다(포인트 지급까지 딸려 온다). `dryRun`을 명시적으로
 * `false`로 보내야만 실제로 DB에 반영된다 — 실수로 전체 유저에게 즉시 발급되는 사고를
 * 막기 위한 안전장치다.
 *
 * ## 로직은 여기 없다
 * 평가·집계는 전부 `reevaluateUsersForCatalog`(`@/lib/badge-engine/reevaluateCatalog`)에
 * 있다. 이 라우트는 인증·입력 검증·대상 유저 조회·상한 체크만 한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { reevaluateUsersForCatalog, MAX_TARGET_USERS_PER_CALL } from '@/lib/badge-engine/reevaluateCatalog'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)

  // 기본값 true — 명시적으로 false를 보내야만 실제 발급된다 (전체 유저 대상 실수 방지)
  const dryRun = body?.dryRun !== false

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

  if (targetUserIds.length === 0) {
    return NextResponse.json({
      dryRun,
      targetUserCount: 0,
      affectedUserCount: 0,
      totalBadgesIssued: 0,
      totalPointsAwarded: 0,
      totalCounterIncrements: 0,
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

  const result = await reevaluateUsersForCatalog(supabase, { dryRun, userIds: targetUserIds })
  return NextResponse.json(result)
}
