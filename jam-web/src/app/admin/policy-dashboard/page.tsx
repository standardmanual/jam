/**
 * 서비스 운영 정책 대시보드 (티켓 20261022_1631)
 *
 * JAM 2.0 서비스 운영 로직 19개 장 전체와 개발 티켓의 세부 결정을 망라하는 관제 화면이다.
 * 실시간 DB 설정값을 함께 읽어 표시하기만 한다. 값을 바꾸는 항목은 카드의 «밸런스 설정에서 바꾸기»
 * 링크로 해당 설정 화면에 보낸다 — 변경 이력·동시 수정 검사·확률 확인창을 설정 화면이 지키기 때문이다(티켓 20261022_1717).
 */
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import { PolicyDashboardClient } from '@/components/admin/policyDashboard/PolicyDashboardClient'
import { loadPolicyLiveValues } from '@/lib/admin/policyDashboard/liveValues'

export const dynamic = 'force-dynamic'

export default async function PolicyDashboardPage() {
  const liveValues = await loadPolicyLiveValues()

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">정책 대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1 text-pretty break-keep wrap-break-word">
          서비스 운영 정책과 밸런스 기준을 한눈에 보고, 바꿀 값은 설정 화면에서 수정해요
        </p>
      </div>

      <PolicyDashboardClient
        initialPolicies={POLICIES_DATA}
        initialLiveValues={liveValues}
        updatedAt={new Date().toISOString()}
      />
    </div>
  )
}
