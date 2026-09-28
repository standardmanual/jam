import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/admin/auth'
import { getAdminQuestPreview } from '@/lib/onboarding-quest/preview'
import OnboardingQuestPreviewAdminClient from './OnboardingQuestPreviewAdminClient'

export const dynamic = 'force-dynamic'

/**
 * 어드민 전용 — 퀘스트 미리보기 단계를 골라 실제 서비스 화면에서 연출을 확인한다
 * (티켓 20260928_0138, N5b). 장치(쿠키 설정·이중 방어·DB 무기록)는 N5a(`preview.ts`,
 * `POST /api/admin/onboarding-quest/preview`)가 만든 것을 그대로 쓴다 — 이 화면은
 * 단계를 고르는 입력만 담당한다.
 */
export default async function OnboardingQuestPreviewPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/forbidden')

  const current = await getAdminQuestPreview()

  return <OnboardingQuestPreviewAdminClient current={current} />
}
