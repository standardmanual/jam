import { ProgressBar } from '@ds/components/feedback/ProgressBar'

/**
 * 진행도 바 + 오른쪽 «n/n» 수치 한 줄 — 컬렉션 상세의 진행도 바(`ItemBookHeroSection`)와 인벤토리의 칸 사용량 바가 같은 모양을 쓴다
 * (2026-11-09 사용자 지시: 인벤토리의 바를 컬렉션 상세의 바로 바꾼다).
 * 바는 높이 16px이고(`ProgressBar` 기본 8px의 두 배), 수치는 13px 굵게 `--link` 색에 숫자 폭이 같다. 바 아래에 문장을 두지 않는다.
 * 바깥 간격(좌우·위)은 호출부가 `className`으로 정한다.
 */
export default function ProgressCountBar({
  percent,
  current,
  total,
  className = '',
}: {
  percent: number
  current: number
  total: number
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <ProgressBar percent={percent} height={16} />
      <span style={{ color: 'var(--link)', fontSize: '13px', lineHeight: '1', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {current}/{total}
      </span>
    </div>
  )
}
