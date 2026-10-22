/**
 * 밸런스 설정 구역 본문의 공용 뼈대 (티켓 20261022_1132 1회) — 서버 컴포넌트.
 *
 * 구역의 현재 값과 최근 변경을 읽어 폼(`BalanceSectionForm`, 클라이언트)과 최근 변경 목록(`BalanceHistory`)에 넘긴다. 읽기만 한다.
 * **값을 읽지 못해도 던지지 않고** 이 구역만 오류 카드가 된다(다른 구역은 그대로 보인다. 서비스 클라이언트를 만들지 못한 경우도 같다).
 * 최근 변경만 못 읽으면 폼은 그대로 열고 목록 자리에 안내가 나온다. 구역 본문 컴포넌트(`JamSection` 등)는 이 뼈대에 구역 연결 객체를 넘기면 된다.
 */
import { Alert } from '@/components/admin/ui/alert'
import { loadBalanceSection, BALANCE_LOAD_FAILED_MESSAGE, type LoadedBalanceSection } from '@/lib/admin/balance/save'
import { fullFieldLabel } from '@/lib/admin/balance/fields'
import type { BalanceSectionBinding } from '@/lib/admin/balance/types'
import { createServiceClient } from '@/lib/supabase/server'
import { BalanceHistory } from './BalanceHistory'
import { BalanceSectionForm } from './BalanceSectionForm'

export async function BalanceSectionBody({ binding }: { binding: BalanceSectionBinding }) {
  let loaded: LoadedBalanceSection
  try {
    loaded = await loadBalanceSection(createServiceClient(), binding)
  } catch (error) {
    console.error(`[admin/balance] ${binding.id} 구역 읽기 실패:`, error instanceof Error ? error.message : error)
    return (
      <Alert variant="destructive">
        <p className="text-sm text-pretty break-keep wrap-break-word">{BALANCE_LOAD_FAILED_MESSAGE}</p>
      </Alert>
    )
  }

  const labels = Object.fromEntries(binding.fields.map((def) => [def.key, fullFieldLabel(def)]))
  const units = Object.fromEntries(binding.fields.map((def) => [def.key, def.unit]))
  return (
    <div className="space-y-6">
      <BalanceSectionForm sectionId={binding.id} fields={binding.fields} values={loaded.values} updatedAt={loaded.updatedAt} />
      <BalanceHistory sectionId={binding.id} entries={loaded.history} labels={labels} units={units} />
    </div>
  )
}
