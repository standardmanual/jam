import BadgeCard from './BadgeCard'
import BadgesTable from './BadgesTable'
import type { BadgeRow, FactionRow } from '@/types/database'

interface BadgeListProps {
  badges: BadgeRow[]
  factionMap?: Map<string, string>
}

export default function BadgeList({ badges, factionMap = new Map() }: BadgeListProps) {
  if (badges.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-sm">일치하는 배지가 없습니다.</p>
      </div>
    )
  }

  return (
    <>
      {/* 모바일: 카드 리스트 */}
      <div className="grid grid-cols-1 md:hidden gap-4">
        {badges.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} />
        ))}
      </div>

      {/* 데스크탑: 테이블 */}
      <div className="hidden md:block">
        <BadgesTable badges={badges} factionMap={factionMap} />
      </div>
    </>
  )
}
