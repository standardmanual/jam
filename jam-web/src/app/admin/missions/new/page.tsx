import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import MissionForm from '../MissionForm'
import { loadMissionFormTribes } from '../missionFormTribes'

export default async function NewMissionPage() {
  // 참가할 수 있는 트라이브 체크 목록(티켓 20261019_1318). 읽지 못하면 던져서 다시 시도 화면이 받는다.
  const tribes = await loadMissionFormTribes(createServiceClient())

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 미션
        </Link>
        <h1 className="text-2xl font-bold mt-2">미션 등록</h1>
      </div>
      <MissionForm badgeLabels={[]} tribes={tribes} />
    </div>
  )
}
