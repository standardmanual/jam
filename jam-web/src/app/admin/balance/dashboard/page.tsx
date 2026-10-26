/**
 * 밸런스 지표 (티켓 20261022_1136 1회 b, 운영 로직 19.2절)
 *
 * 캡슐을 여는 속도, 챕터 도달 속도, 한 달에 받는 아이템 배지, 등급 체감, 컬렉션 완성 속도, 인벤토리가 거의 가득 찬 유저의 비율을 목표와 함께 보인다.
 * 문제가 되는 수치는 카드의 «바로 조정»으로 밸런스 설정(`/admin/balance`)의 해당 구역에 가서 바꾼다(구역 단위 링크).
 *
 * 서버 컴포넌트가 서비스 클라이언트로 읽기만 한다. **`loadBalanceDashboard`는 인가를 검사하지 않는다.** 이 화면은 `hasAdminAccess`를 거치는
 * `app/admin/layout.tsx` 아래에서만 부르고, 읽기용 API 라우트(토큰 포함)는 만들지 않는다.
 * 지표 하나를 읽지 못하면 그 카드만 오류 카드가 되므로(`load.ts`) 구역별 `Suspense`를 두지 않는다.
 *
 * 요청마다 지금 시각으로 계산하므로 정적으로 굳지 않게 `force-dynamic`이다.
 */
import { BalanceDashboardView } from '@/components/admin/balanceDashboard/BalanceDashboardView'
import { BALANCE_SECTIONS } from '@/lib/admin/balance/sections'
import { loadBalanceDashboard } from '@/lib/admin/balanceDashboard/load'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function BalanceDashboardPage() {
  const data = await loadBalanceDashboard(createServiceClient(), new Date())
  const sectionLabels = Object.fromEntries(BALANCE_SECTIONS.map((section) => [section.binding.id, section.label]))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-balance break-keep wrap-break-word">밸런스 지표</h1>
        <p className="text-muted-foreground text-sm mt-1 text-pretty break-keep wrap-break-word">
          지표 여섯 개를 목표와 견줘 봐요. 목표는 기준 유저(러닝 보통)의 값이에요. 데이터가 모자란 지표는 값을 보이지 않아요. 문제가 되는 수치는 지표 아래 바로 조정에서 밸런스 설정의 해당 구역으로 가서 바꿔요.
        </p>
      </div>

      <BalanceDashboardView data={data} sectionLabels={sectionLabels} />
    </div>
  )
}
