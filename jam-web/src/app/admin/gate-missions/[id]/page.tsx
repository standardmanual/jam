import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow } from '@/types/database'
import GateMissionForm from '../GateMissionForm'
import { loadGateMissionFormData } from '../formData'

export default async function EditGateMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data }, { families, rewardBadgeLabels, activityTypeLabels, existingAxes }] = await Promise.all([
    supabase.from('missions').select('*').eq('id', id).single(),
    loadGateMissionFormData(),
  ])
  if (!data) notFound()
  const mission = data as MissionRow

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <Link href="/admin/gate-missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 게이트 미션 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">게이트 미션 수정</h1>
      </div>
      <GateMissionForm
        mission={mission}
        existingAxes={existingAxes}
        families={families}
        rewardBadgeLabels={rewardBadgeLabels}
        activityTypeLabels={activityTypeLabels}
      />
    </div>
  )
}
