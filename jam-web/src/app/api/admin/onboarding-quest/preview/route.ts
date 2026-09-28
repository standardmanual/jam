// POST /api/admin/onboarding-quest/preview
// 관리자 전용 퀘스트 미리보기 쿠키 설정 (티켓 20260928_1335, 상위 20260927_2123 N5a)
//
// 1차 방어: `requireAdmin()`으로 이 라우트 자체를 막는다. 본문 { step: <단계 키 | 'done'> }면
// 그 값으로 쿠키를 설정하고, { reset: true }면 쿠키를 지운다(미리보기 종료). DB에는 아무것도
// 쓰지 않는다 — `preview.ts`의 쿠키 함수만 호출한다.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import {
  parseQuestPreview,
  setQuestPreviewCookie,
  clearQuestPreviewCookie,
} from '@/lib/onboarding-quest/preview'

export async function POST(request: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = (await request.json().catch(() => null)) as { step?: string; reset?: boolean } | null

  if (body?.reset) {
    await clearQuestPreviewCookie()
    return NextResponse.json({ success: true })
  }

  const preview = parseQuestPreview(body?.step)
  if (!preview) {
    return NextResponse.json({ error: 'INVALID_STEP' }, { status: 400 })
  }

  await setQuestPreviewCookie(preview)
  return NextResponse.json({ success: true })
}
