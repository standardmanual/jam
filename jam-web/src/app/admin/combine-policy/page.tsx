import { getCombinePolicy } from '@/lib/combine/policy'
import CombinePolicyForm from './CombinePolicyForm'

export default async function AdminCombinePolicyPage() {
  const policy = await getCombinePolicy()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">믹스 정책</h1>
        <p className="text-muted-foreground text-sm mt-1">
          정석 레시피(믹스 레시피 메뉴)에 매칭되지 않는 임의 믹스의 확률·피티 파라미터.
          저장 즉시 다음 믹스부터 적용됩니다.
        </p>
      </div>
      <CombinePolicyForm initial={policy} />
    </div>
  )
}
