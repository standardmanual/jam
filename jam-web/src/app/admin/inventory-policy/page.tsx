import { getInventoryPolicy, getInventoryUserCount } from '@/lib/inventory/policy'
import InventoryPolicyForm from './InventoryPolicyForm'

export default async function AdminInventoryPolicyPage() {
  const [policy, affectedUserCount] = await Promise.all([getInventoryPolicy(), getInventoryUserCount()])

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">인벤토리 최대치</h1>
        <p className="text-muted-foreground text-sm mt-1">
          전체 유저의 인벤토리 최대 슬롯 수(max_slots) 정책이에요. 저장하면 기존 유저 전원의
          인벤토리와, 앞으로 가입할 신규 유저의 기본값에 모두 적용됩니다. 유저별 개별 조정은
          이 화면의 범위 밖이에요.
        </p>
      </div>
      <InventoryPolicyForm initialMaxSlots={policy.max_slots} initialAffectedUserCount={affectedUserCount} />
    </div>
  )
}
