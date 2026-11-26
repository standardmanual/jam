import { ProgressBar } from '@/components/ui/ProgressBar'

/**
 * 진행도 바 + 오른쪽 «n/n» 수치 한 줄 — 컬렉션 상세의 진행도 바(`collections/[id]/page.tsx`)와 인벤토리의 칸 사용량 바가 같은 모양을 쓴다
 * (2026-11-09 사용자 지시: 인벤토리의 바를 컬렉션 상세의 바로 바꾼다).
 * 바는 높이 16px이고(`ProgressBar` 기본 8px의 두 배), 채움은 기본이 강조색 그린(`--jam-green`)이다(2026-11-11 사용자 지시, 티켓 20261111_1005).
 * 채움색은 `color`로 바꿀 수 있다. 컬렉션 상세는 홈 캡슐 게이지와 같은 `--capsule-fill`을 넘긴다(2026-11-25 사용자 지시, 티켓 20261125_1345).
 * 모양은 홈 캡슐 게이지와 같은 캡슐 변형(어두운 트랙 `--capsule-track` 위 둥근 채움)이다(2026-11-14 사용자 지시, 티켓 20261114_1502).
 * 수치는 13px 굵게 `--link` 색에 숫자 폭이 같다. 바 아래에 문장을 두지 않는다.
 * 바깥 간격(좌우·위)은 호출부가 `className`으로 정한다.
 *
 * @summary 진행 막대와 오른쪽 «n/n» 수치를 한 줄로 보여 준다. 컬렉션 상세와 인벤토리에서 쓴다.
 */
export default function ProgressCountBar({
  percent,
  current,
  total,
  className = '',
  color = 'var(--jam-green)',
}: {
  percent: number
  current: number
  total: number
  className?: string
  /** 바 채움색(CSS 색 값). 기본은 강조색 그린이다 */
  color?: string
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <ProgressBar shape="capsule" percent={percent} height={16} color={color} />
      <span className="leading-none font-bold" style={{ color: 'var(--link)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
        {current}/{total}
      </span>
    </div>
  )
}
