import Link from 'next/link'
import { getDropPolicy } from '@/lib/drop-engine/policy'
import DropPolicyForm from './DropPolicyForm'

export default async function AdminDropPolicyPage() {
  const policy = await getDropPolicy()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">드랍 정책</h1>
        <p className="text-muted-foreground text-sm mt-1">
          아이템배지 드랍엔진 v2 파라미터. 저장 즉시 다음 드랍부터 적용됩니다. 로직:
          Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md §3
        </p>
        <p className="text-sm mt-2">
          특정 아이템배지·컬렉션을 드랍 후보에서 빼려면{' '}
          <Link href="/admin/drop-policy/exclusions" className="underline hover:text-foreground">
            드랍 제외 관리
          </Link>
          로 이동하세요.
        </p>
      </div>
      <DropPolicyForm initial={policy} />
    </div>
  )
}
