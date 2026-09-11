import Link from 'next/link'
import GateMissionForm from '../GateMissionForm'
import { loadGateMissionFormData } from '../formData'

export default async function NewGateMissionPage() {
  const { families, rewardBadgeLabels, activityTypeLabels, existingAxes } = await loadGateMissionFormData()

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <Link href="/admin/gate-missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 게이트 미션 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">새 게이트 미션</h1>
      </div>
      <GateMissionForm
        existingAxes={existingAxes}
        families={families}
        rewardBadgeLabels={rewardBadgeLabels}
        activityTypeLabels={activityTypeLabels}
      />
    </div>
  )
}
