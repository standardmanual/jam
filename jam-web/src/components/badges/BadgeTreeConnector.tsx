import { ChevronRightIcon } from '@/components/ui/icons'

/**
 * 배지 트리(/badges/tree) 전용 — 단계(stage) 사이 세로 커넥터.
 * "이 배지들을 얻어야 다음 단계가 열린다"는 흐름을 시각적으로만 보조한다(순수 장식,
 * 실제 순서 정보는 각 단계 위의 "N단계" 라벨이 전달하므로 스크린리더에는 숨긴다).
 * 서비스 전용 UI(MODULAR 승격 대상 아님) — 티켓 20260831_2208.
 */
export default function BadgeTreeConnector() {
  return (
    <div className="flex flex-col items-center py-[var(--spacing-4)]" aria-hidden="true">
      <div className="w-px h-3 bg-white/15" />
      <ChevronRightIcon className="w-4 h-4 rotate-90 text-white/30" />
      <div className="w-px h-3 bg-white/15" />
    </div>
  )
}
