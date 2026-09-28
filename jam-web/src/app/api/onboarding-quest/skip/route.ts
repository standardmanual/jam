// POST /api/onboarding-quest/skip
// 온보딩 퀘스트 건너뛰기 기록 (티켓 20260927_2131 T8, 상위 20260927_2123)
//
// 로그인 필수. 기능 스위치가 꺼져 있으면 거부한다. 행이 없으면 거부(`NOT_FOUND`), 이미
// 건너뛴 요청은 멱등 성공, 7단계를 모두 마친 유저는 거부한다(`validateSkip`, progress.ts —
// 실수로 보상을 잃지 않도록 막는다). 여기서는 `user_onboarding_quests.skipped_at`만
// 기록한다 — 실제 배지·포인트·아이템 지급은 이 화면에서 일어나지 않는다.
//
// 갱신 직후 `recordOnboardingQuestCompletion`을 호출한다 — 건너뛴 시점에 이미 처리된 실제
// 활동이 있으면 완료 시각도 함께 기록한다(사용자 결정 2, 20260927_2129). 건너뛴 유저는
// `shouldGrantQuestReward`가 막아 완료 배지·포인트는 받지 않는다.

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ONBOARDING_QUEST_ENABLED } from '@/lib/onboarding-quest/config'
import { validateSkip } from '@/lib/onboarding-quest/progress'
import { recordOnboardingQuestCompletion } from '@/lib/onboarding-quest/completion'
import type { OnboardingQuestStepKey } from '@/types/database'

export async function POST() {
  if (!ONBOARDING_QUEST_ENABLED) {
    return NextResponse.json({ error: 'DISABLED' }, { status: 403 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const serviceClient = createServiceClient()
  const { data: row, error: rowError } = await serviceClient
    .from('user_onboarding_quests')
    .select('step_progress, skipped_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError) {
    console.error('[onboarding-quest/skip] 행 조회 오류:', rowError.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  const result = validateSkip(
    row
      ? {
          step_progress: (row.step_progress ?? {}) as Partial<Record<OnboardingQuestStepKey, string>>,
          skipped_at: row.skipped_at,
        }
      : null
  )

  if (!result.ok) {
    const status = result.reason === 'NOT_FOUND' ? 404 : 409
    return NextResponse.json({ error: result.reason }, { status })
  }

  // 멱등 — 이미 건너뛴 요청은 갱신 없이 완료 판정만 다시 확인한다.
  if (!result.alreadySkipped) {
    const { error: updateError } = await serviceClient
      .from('user_onboarding_quests')
      .update({ skipped_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('skipped_at', null)

    if (updateError) {
      console.error('[onboarding-quest/skip] skipped_at 갱신 오류:', updateError.message)
      return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }
  }

  await recordOnboardingQuestCompletion(serviceClient, user.id)

  return NextResponse.json({ success: true, alreadySkipped: result.alreadySkipped })
}
