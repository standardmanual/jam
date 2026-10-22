/**
 * 서비스 운영 정책 대시보드 (티켓 20261022_1631)
 *
 * JAM 2.0 서비스 운영 로직 19개 장 전체와 개발 티켓의 세부 결정을 망라하는 관제 화면이다.
 * 실시간 DB 설정값을 함께 읽어 표시하고, 즉시 수정 가능한 항목은 대시보드에서 인라인으로 변경한다.
 */
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import { PolicyDashboardClient } from '@/components/admin/policyDashboard/PolicyDashboardClient'
import { getJamPolicy } from '@/lib/jam/policy'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { getCombinePolicy } from '@/lib/combine/policy'
import { getInventoryPolicy } from '@/lib/inventory/policy'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { getCapsulePolicy } from '@/lib/capsule/policy'

export const dynamic = 'force-dynamic'

export default async function PolicyDashboardPage() {
  const [jamRes, abusingRes, combineRes, inventoryRes, ambientRes, capsuleRes] =
    await Promise.allSettled([
      getJamPolicy(),
      getAbusingPolicy(),
      getCombinePolicy(),
      getInventoryPolicy(),
      getAmbientDropConfig(),
      getCapsulePolicy(),
    ])

  const liveValues: Record<string, unknown> = {
    ...(jamRes.status === 'fulfilled' ? jamRes.value : {}),
    ...(abusingRes.status === 'fulfilled' ? abusingRes.value : {}),
    ...(combineRes.status === 'fulfilled' ? combineRes.value : {}),
    ...(inventoryRes.status === 'fulfilled' ? inventoryRes.value : {}),
    ...(ambientRes.status === 'fulfilled' ? ambientRes.value : {}),
    ...(capsuleRes.status === 'fulfilled' ? capsuleRes.value : {}),
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">정책 대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1">
          서비스 운영 정책과 밸런스 기준을 한눈에 조망하고 관리해요
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
