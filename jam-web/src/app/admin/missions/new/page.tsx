import Link from 'next/link'
import MissionForm from '../MissionForm'

export default function NewMissionPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 미션 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">새 미션</h1>
      </div>
      <MissionForm badgeLabels={[]} />
    </div>
  )
}
