// POST /api/onboarding-quest/step
// 온보딩 퀘스트 단계 완료 기록 (티켓 20260927_2330, 상위 20260927_2123 T2a)
//
// 본문 { step: OnboardingQuestStepKey }. 로그인 필수. 기능 스위치가 꺼져 있거나, 행이
// 없거나, skipped_at이 있으면 거부한다. 순서 강제는 `validateStepAdvance`(progress.ts)가
// 판정한다 — 아직 안 끝난 첫 단계면 기록, 이미 끝낸 단계면 멱등 성공, 그 외는 거부.
// 여기서는 `user_onboarding_quests.step_progress`만 갱신한다 — 실제 배지·포인트·아이템
// 지급은 이 화면에서 일어나지 않는다(연출용 데이터).
//
// 관리자 미리보기 쿠키가 있으면(N5a, 티켓 20260928_1335) 인증 직후·스위치 검사 전에
// 가로챈다 — DB를 읽거나 쓰지 않고 쿠키만 갱신한다.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ONBOARDING_QUEST_ENABLED, ONBOARDING_QUEST_STEPS } from '@/lib/onboarding-quest/config'
import { validateStepAdvance } from '@/lib/onboarding-quest/progress'
import { recordOnboardingQuestCompletion } from '@/lib/onboarding-quest/completion'
import {
  getAdminQuestPreview,
  advancePreviewStep,
  setQuestPreviewCookie,
} from '@/lib/onboarding-quest/preview'
import type { OnboardingQuestStepKey } from '@/types/database'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = (await request.json()) as { step?: string }
  const step = body.step as OnboardingQuestStepKey | undefined

  if (!step || !ONBOARDING_QUEST_STEPS.includes(step)) {
    return NextResponse.json({ error: 'INVALID_STEP' }, { status: 400 })
  }

  const preview = await getAdminQuestPreview()
  if (preview) {
    const advance = advancePreviewStep(preview, step)
    if (!advance.ok) {
      return NextResponse.json({ error: 'OUT_OF_ORDER' }, { status: advance.status })
    }
    await setQuestPreviewCookie(advance.value)
    return NextResponse.json({ success: true, alreadyDone: advance.alreadyDone, preview: true })
  }

  if (!ONBOARDING_QUEST_ENABLED) {
    return NextResponse.json({ error: 'DISABLED' }, { status: 403 })
  }

  const serviceClient = createServiceClient()
  const { data: row, error: rowError } = await serviceClient
    .from('user_onboarding_quests')
    .select('step_progress, skipped_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError) {
    console.error('[onboarding-quest/step] 행 조회 오류:', rowError.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  if (!row) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  if (row.skipped_at) {
    return NextResponse.json({ error: 'SKIPPED' }, { status: 409 })
  }

  const progress = (row.step_progress ?? {}) as Partial<Record<OnboardingQuestStepKey, string>>
  const result = validateStepAdvance(progress, step)

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 })
  }

  // 멱등 — 이미 끝낸 단계 재요청은 아무것도 바꾸지 않는다.
  if (result.alreadyDone) {
    return NextResponse.json({ success: true, alreadyDone: true })
  }

  const { error: updateError } = await serviceClient
    .from('user_onboarding_quests')
    .update({ step_progress: { ...progress, [step]: new Date().toISOString() } })
    .eq('user_id', user.id)

  if (updateError) {
    console.error('[onboarding-quest/step] step_progress 갱신 오류:', updateError.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  // 마지막 단계(현재 browse) 기록 직후 — 연출 도중 이미 연동돼 처리된 활동이 있으면
  // 그 자리에서 완료를 기록한다(사용자 결정 2). 실패해도 throw하지 않아 응답에 영향 없다.
  if (step === ONBOARDING_QUEST_STEPS[ONBOARDING_QUEST_STEPS.length - 1]) {
    await recordOnboardingQuestCompletion(serviceClient, user.id)
  }

  return NextResponse.json({ success: true, alreadyDone: false })
}
