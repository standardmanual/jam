/**
 * 로컬 개발서버 및 staging 전용 구글 로그인 우회 라우트.
 *
 * ⚠️ 보안 핵심: 아래 두 조건 중 하나를 충족해야만 동작한다.
 *   1) NODE_ENV === 'development' — 로컬 next dev 전용
 *   2) STAGING_MODE === 'true'   — Vercel staging 프로젝트 전용 서버 환경변수
 * 둘 다 아니면 무조건 404.
 * Vercel은 프리뷰/프로덕션 빌드 모두 NODE_ENV=production으로 고정되므로,
 * 프로덕션 Vercel 프로젝트에 STAGING_MODE가 없으면 절대 동작하지 않는다.
 * (docs/tickets/20260812_004 참고)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  DEV_LOGIN_USER_EMAIL,
  DEV_LOGIN_USER_ID,
  isStagingOrDevEnv,
} from '@/lib/env/test-accounts'
import { ONBOARDING_QUEST_ENABLED } from '@/lib/onboarding-quest/config'
import { ensureDevLoginTribe } from '@/lib/tribe/dev-login-tribe'

// 고정 테스트 유저 — jam-web/supabase/seed_dev_test_user.sql과 동일한 값 사용
// (프로덕션 공개 목록 제외 대상·staging 어드민 차단 대상 — jam-web/src/lib/env/test-accounts.ts가 단일 진실)
const DEV_USER_ID = DEV_LOGIN_USER_ID
const DEV_USER_EMAIL = DEV_LOGIN_USER_EMAIL

export async function GET(request: NextRequest) {
  // 절대 최우선 게이트: 허용 환경이 아니면 라우트 자체가 존재하지 않는 것처럼 취급
  if (!isStagingOrDevEnv()) {
    return new NextResponse(null, { status: 404 })
  }

  const { origin } = new URL(request.url)
  const serviceClient = createServiceClient()

  // 1) 고정 UUID로 테스트 유저 생성 시도 (이미 있으면 무시)
  // 주의: supabase-js의 AdminUserAttributes 타입에는 id가 노출돼 있지 않지만
  // GoTrue admin API는 서버에서 실제로 지원한다 — 고정 UUID로 시드 데이터와
  // 매칭시키기 위해 필요, any 캐스팅으로 우회.
  const { error: createError } = await serviceClient.auth.admin.createUser({
    id: DEV_USER_ID,
    email: DEV_USER_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: 'dev-tester' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  if (createError && !createError.message.includes('already been registered')) {
    console.error('[JAM!][dev-login] 테스트 유저 생성 실패:', createError.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // 2) magiclink 토큰 발급
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: DEV_USER_EMAIL,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[JAM!][dev-login] 매직링크 생성 실패:', linkError?.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // 3) 발급된 토큰으로 실제 세션(쿠키) 생성 — 구글 OAuth 없이 로그인 완료
  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })

  if (verifyError) {
    console.error('[JAM!][dev-login] 세션 발급 실패:', verifyError.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // 4) 트라이브 게이트(티켓 20261021_1247) 때문에 트라이브가 없는 테스트 계정은 어디서나 고르기 화면에 막힌다.
  //    이 계정의 tribe_id가 비어 있을 때만 활성 트라이브 하나를 지정한다(이미 있으면 그대로, 활성 트라이브가 없으면 지정 없이 계속).
  //    위의 환경 게이트(isStagingOrDevEnv) 안에서만 도달한다. 실패해도 로그인은 막지 않는다.
  await ensureDevLoginTribe(serviceClient, DEV_USER_ID)

  // 5) 이 계정은 온보딩을 거치지 않아 퀘스트 행(`user_onboarding_quests`)이 없다. 행이 없으면 퀘스트 완료 처리가 바로 끝나
  //    로컬·staging 확인 계정이 실제 2단계를 마쳐도 챕터 1을 받지 못한다(티켓 20261021_1248).
  //    `/api/onboarding/complete`와 같은 형태로 행이 없을 때만 만든다(`ignoreDuplicates` — 있으면 건드리지 않는다).
  //    위의 환경 게이트(isStagingOrDevEnv) 안에서만 도달하고, 실패해도 로그인은 막지 않는다.
  if (ONBOARDING_QUEST_ENABLED) {
    try {
      const { error: questRowError } = await serviceClient
        .from('user_onboarding_quests')
        .upsert({ user_id: DEV_USER_ID }, { onConflict: 'user_id', ignoreDuplicates: true })
      if (questRowError) {
        console.error('[JAM!][dev-login] 테스트 계정 퀘스트 행 생성 실패:', questRowError.message)
      }
    } catch (err) {
      console.error('[JAM!][dev-login] 테스트 계정 퀘스트 행 처리 중 오류:', err)
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
