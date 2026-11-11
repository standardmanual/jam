import { d, t } from '@/lib/i18n'

/**
 * 방문 횟수 칩 «×N» — 체크인 배지의 목록 카드(`BadgeGridCard`)와 상세 히어로 카드(`BadgeHeroSection`)가 같은 칩을 쓴다(2026-11-09 사용자 지시).
 * 아이템 배지의 등급 칩이 놓이는 자리(이름 바로 위·아래)에 같은 크기(글자 --text-xs, 패딩 --chip-padding, 줄 높이 --text-xs--line-height, 높이 20px — 모든 칩의 기준인 `ListRowChip`과 같다, 티켓 20261112_0010)로 그린다.
 * 면은 레벨 칩과 같은 `--default-soft`이고 글자는 `--foreground`다. 1회 방문은 그리지 않는다(2회 이상일 때만). 읽는 문장은 sr-only가 맡는다.
 */
export default function VisitCountChip({ count }: { count: number | null | undefined }) {
  if (typeof count !== 'number' || count <= 1) return null
  return (
    <>
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center rounded-full font-bold tabular-nums text-foreground"
        style={{ background: 'var(--default-soft)', fontSize: 'var(--text-xs)', padding: 'var(--chip-padding)', lineHeight: 'var(--text-xs--line-height)' }}
      >
        ×{count}
      </span>
      <span className="sr-only">{t(d.badges.visitCountAria, { count: String(count) })}</span>
    </>
  )
}
