/**
 * GET /api/admin/ops-rules — 운영 규칙 읽기 (티켓 20260930_1459 조각 B, 운영툴 PRD §11.5)
 *
 * 쿼리 `group`(기본 `balance`, `signal`도 받는다)의 규칙 행을 돌려준다. 혜린의 주간 밸런스 점검(1504)이 툴과 같은 값을 이 경로로 읽는다.
 *
 * - 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용). **쓰기 메서드는 두지 않는다** — 값을 바꾸는 `PATCH`는
 *   `[ruleKey]/route.ts`이고 관리자 로그인 세션만 통과한다(토큰 쓰기 예외는 제출 경로 하나뿐이다. `token-write-contract.test.ts`).
 * - 응답: `{ group, rules: [{ ruleKey, group, value, level, enabled, updatedAt, updatedBy, previousValue }] }`. 밸런스 규칙은 R1~R8 순서다.
 *   `level`은 `info`(참고)·`warn`(주의). 규칙이 아직 없으면 `rules`가 빈 목록이다.
 */
import { NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { RULE_LOAD_FAILED_MESSAGE, isOpsRuleGroup, listOpsRules } from '@/lib/admin/opsInbox/balance/save'

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const group = new URL(req.url).searchParams.get('group') ?? 'balance'
  if (!isOpsRuleGroup(group)) {
    return NextResponse.json({ error: '규칙 묶음은 balance나 signal이어야 해요.' }, { status: 400 })
  }

  try {
    const rules = await listOpsRules(createServiceClient(), group)
    return NextResponse.json({ group, rules })
  } catch (error) {
    console.error('[admin/ops-rules] 규칙 조회 실패:', error)
    return NextResponse.json({ error: RULE_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}
