import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import MissionForm from '../MissionForm'
import { loadMissionFormPoiCategories } from '../missionFormPoiCategories'
import { loadMissionFormTribes } from '../missionFormTribes'

export default async function NewMissionPage() {
  const supabase = createServiceClient()
  // 참가할 수 있는 트라이브 체크 목록(티켓 20261019_1318)과 «기록으로 세는 조건»의 장소 카테고리 선택지(티켓 20261021_1114 2회).
  // 읽지 못하면 던져서 다시 시도 화면이 받는다.
  const [tribes, poiCategories] = await Promise.all([loadMissionFormTribes(supabase), loadMissionFormPoiCategories(supabase)])

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <Link href="/admin/missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 미션
        </Link>
        <h1 className="text-2xl font-bold mt-2">미션 등록</h1>
      </div>
      <MissionForm badgeLabels={[]} tribes={tribes} poiCategories={poiCategories} />
    </div>
  )
}
