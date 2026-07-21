import { getDropPolicy } from '@/lib/drop-engine/policy'
import DropPolicyForm from './DropPolicyForm'

export default async function AdminDropPolicyPage() {
  const policy = await getDropPolicy()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">드랍 정책</h1>
        <p className="text-white/40 text-sm mt-1">
          아이템배지 드랍엔진 v2 파라미터. 저장 즉시 다음 드랍부터 적용됩니다. 로직:
          PRD/badge/BADGE_ENGINE_UNIFIED.md §3
        </p>
      </div>
      <DropPolicyForm initial={policy} />
    </div>
  )
}
