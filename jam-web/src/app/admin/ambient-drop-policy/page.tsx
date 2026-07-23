import { getAmbientDropPolicy } from '@/lib/ambient-drop/policy'
import AmbientDropPolicyForm from './AmbientDropPolicyForm'

export default async function AdminAmbientDropPolicyPage() {
  const policy = await getAmbientDropPolicy()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">앰비언트 드랍 정책</h1>
        <p className="text-white/40 text-sm mt-1">
          POI 상시 자동 배치(source=&apos;system&apos;) 파라미터. 매시간 크론(/api/cron/ambient-drop-monitor)이
          이 정책으로 부족분을 보충합니다. 로직: PRD/badge/BADGE_ENGINE_UNIFIED.md §3.12
        </p>
      </div>
      <AmbientDropPolicyForm initial={policy} />
    </div>
  )
}
