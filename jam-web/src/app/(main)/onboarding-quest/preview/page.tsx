import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/admin/auth'
import QuestPreviewClient from './QuestPreviewClient'

/**
 * 온보딩 퀘스트 관리자 미리보기 진입점 (티켓 20260928_0058, 상위 20260927_2123).
 *
 * 관리자 계정만 들어올 수 있다 — 기능 스위치(`ONBOARDING_QUEST_ENABLED`)·
 * `user_onboarding_quests` 행 유무는 보지 않는다(관리자는 스위치·대상 여부와 무관하게
 * 언제든 1단계부터 테스트할 수 있어야 한다는 요구사항). 관리자가 아니면 렌더 없이 홈으로
 * 보낸다.
 */
export default async function OnboardingQuestPreviewPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/')

  return <QuestPreviewClient />
}
