/**
 * 유저 1명 「조건 충족·미발급」 진단 — 어드민 전용 (티켓 20260906_1432)
 *
 * ## 왜 필요한가
 * 배지 발급은 「새 활동 동기화」가 있어야만 실행된다(티켓 20260906_1426). 그래서 조건은
 * 이미 넘겼는데 다음 활동이 들어오지 않아 발급이 미뤄지는 구간이 생기고, 이 지연은
 * `engine_decision_log`에도 남지 않는다 — 평가 자체가 실행돼야 로그가 남기 때문이다.
 * 유저를 신고 없이도 붙잡을 수 있게, 어드민 유저 상세에서 온디맨드로 진단한다.
 *
 * ## 어떻게 판정하는가 — 화면의 조건 체크가 아니라 실제 발급 엔진을 그대로 재사용
 * `computeConditionMetBadgeIds`(배지 트리 화면, `badgeTreeConditionCheck.server.ts`)는
 * **게이트가 잠긴 눈금의 수치 조건만** 확인한다(교차 게이트가 있으면 아예 건너뛴다) —
 * 화면에서 「조건 충족(라임)」 표시 대상 자체가 「게이트 열림」 눈금을 포함하지 않는다.
 * 그런데 이 티켓의 원인 사례(20260906_1426, `running:C1` Common)는 정확히 **게이트가
 * 없는(=이미 열린) 눈금**이었다 — 그 조합으로는 이번 사건 자체를 못 잡는다.
 *
 * 그래서 이 라우트는 화면의 조건 체크를 재사용하지 않고, **실제 발급 엔진
 * `evaluateBadgesDetailed`를 `dryRun: true`로 그대로 호출**한다. 게이트·교차 게이트·
 * 첫 싱크 제한까지 실제 발급 판정과 완전히 같은 경로를 타므로 「지금 평가를 돌리면 무엇이
 * 나올까」에 대한 단일 진실이다(티켓 20260906_1431의 카탈로그 재평가 배치와 같은 재사용
 * 전제). `dryRun: true`는 DB에 아무것도 쓰지 않는다(index.ts 발급 INSERT가
 * `if (!dryRun)`로 감싸여 있다) — 몇 번을 눌러도 안전하다.
 *
 * `overrideFirstSync`는 넘기지 않는다(재평가 배치와 다른 점) — 실제
 * `users.initial_sync_done`을 그대로 반영해야 "지금 실제로 동기화하면 정말 나올 값"과
 * 일치한다. 재평가 배치는 "이 유저의 첫 동기화 여부와 무관하게 강제 지급"이 목적이라 항상
 * `false`를 명시하지만, 이 진단은 반대로 "정말 지금 미뤄진 게 맞는지"를 보는 도구라 실제
 * 상태를 왜곡하면 오탐이 생긴다.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { evaluateBadgesDetailed } from '@/lib/badge-engine'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const { id: userId } = await params

  const supabase = createServiceClient()
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })
  if (!userRow) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 })

  const startedAt = Date.now()
  const { earned, counted } = await evaluateBadgesDetailed(userId, [], {
    dryRun: true,
    triggeredBy: 'admin_diagnosis',
    silent: true,
  })
  const elapsedMs = Date.now() - startedAt

  console.info(
    `[admin/users/badge-diagnosis] userId: ${userId}, 조건충족·미발급: ${earned.length}건, ${elapsedMs}ms (by admin: ${admin.email})`
  )

  return NextResponse.json({
    conditionMetBadges: earned.map((b) => ({ id: b.id, name: b.name, rarity: b.rarity })),
    // 반복형 회차만 오른 건(발급 아님) — 진단 부가 정보로 함께 내려준다.
    counted,
    elapsedMs,
  })
}
