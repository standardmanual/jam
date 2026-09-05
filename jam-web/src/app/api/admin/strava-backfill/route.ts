/**
 * Strava 확장 필드 백필 — 어드민 실행 라우트 (티켓 20260905_1242)
 *
 * ## 왜 서버에서만 돌 수 있는가
 * `strava_connections`의 토큰은 `ENCRYPTION_KEY`로 암호화돼 있고, 그 키는 Vercel에 Secret
 * 타입으로만 존재해 `vercel env pull`로 내려오지 않는다. 로컬 CLI(`scripts/backfill-strava-
 * extended-fields.ts`)로는 복호화가 불가능해, 실행 경로가 이 어드민 라우트뿐이다.
 * 어드민 인증·복호화 키가 프로덕션에만 있는 것은 설계다 — 이 라우트는 프로덕션에서 동작한다.
 *
 * ## 로직을 다시 구현하지 않는다
 * `src/lib/strava/backfill.ts`의 `backfillExtendedFields`를 **그대로 import해서 호출한다.**
 * 그 모듈은 ① 배지·드랍·미션·소식·피드를 import조차 하지 않고 ② `last_synced_at`을 건드리지
 * 않으며 ③ `strava_activities`에 쓰는 컬럼이 `normalized` 하나뿐이라는 성질을 테스트로
 * 고정해 두었다. 여기에 로직을 복사하면 그 방어가 통째로 무력해진다.
 *
 * ## 유저 1명 = 1회 호출
 * Vercel 서버리스 상한이 60초다. CLI 기본값(요청 예산 90 · 간격 1,500ms)은 대기만 135초라
 * 들어가지 않는다. 실측 2026-09-05 기준 유저 10명 / 활동 873건이고 목록 엔드포인트가
 * `per_page=200`이므로, 유저 1명은 1~2회 호출이면 끝난다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { backfillExtendedFields } from '@/lib/strava/backfill'
import { loadBackfillOverview } from '@/lib/strava/backfillStats'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * 이 호출 한 번에 허용할 Strava 요청 수. 유저 1명 기준이라 CLI 기본값(90)이 아니다.
 * 6회 = 활동 1,200건까지 커버한다(실측 유저당 약 87건).
 */
const REQUEST_BUDGET_PER_CALL = 6

/** 요청 사이 대기(ms). 최악의 경우(6회)에도 대기 총합이 5초라 60초 안에 든다 */
const REQUEST_DELAY_MS = 1_000

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!userId) {
    return NextResponse.json({ error: '대상 유저를 선택해 주세요.' }, { status: 400 })
  }
  // 명시적으로 true일 때만 쓴다 — 기본값은 미리보기다
  const apply = body?.apply === true

  const supabase = createServiceClient()

  // 대상 유저가 실제로 Strava 동기화를 한 유저인지 먼저 확인한다. `backfillExtendedFields`는
  // 대상이 0명이면 조용히 아무 일도 안 하고 끝나는데, 화면에서는 그게 «성공»으로 보인다.
  const { data: connection, error: connectionError } = await supabase
    .from('strava_connections')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 })
  }
  if (!connection) {
    return NextResponse.json(
      { error: '이 유저의 Strava 동기화 정보를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  const logs: string[] = []
  try {
    const summary = await backfillExtendedFields(supabase, {
      apply,
      userIds: [userId],
      requestBudget: REQUEST_BUDGET_PER_CALL,
      requestDelayMs: REQUEST_DELAY_MS,
      log: (message) => {
        logs.push(message)
        console.info(message)
      },
    })

    // 실행 직후 측정 — 화면 최초 렌더와 같은 함수를 쓴다(숫자 계산 방식이 갈리지 않게).
    // 티켓 20260905_0039가 유저를 전원 삭제하면 이 실데이터는 사라지므로, 이 한 번의
    // 측정이 임계값 설계(20260905_0035)의 실측 근거다.
    const overview = await loadBackfillOverview(supabase)

    return NextResponse.json({
      apply: summary.apply,
      result: summary.users[0] ?? null,
      logs,
      overview,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/admin/strava-backfill] 백필 오류:', err)
    return NextResponse.json({ error: message, logs }, { status: 500 })
  }
}
