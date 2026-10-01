import SafeImage from '@/components/SafeImage'
import ListRowCard from '@/components/ui/ListRowCard'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { CoinIcon, PackageIcon } from '@/components/ui/icons'
import { formatKoreanDateTime } from '@/components/LocalDate'
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

export interface RecipeRewardBadge {
  id: string
  name: string
  image_url: string | null
  rarity: BadgeRarity | null
}

interface Props {
  /** 레시피 이름 — combination_recipes.name (마이그레이션 175, 티켓 20260917_1828) */
  title: string
  /** 슬롯 개수 — 타이틀 우측에 회색 원형 배지 안 숫자로 표시 (티켓 20260917_2028 후속 조정) */
  slotCount: number
  badges: RecipeRewardBadge[]
  points: number
  /** 지정하면 레시피 탐색 목록 행(클릭 가능). 생략하면 믹서 상단 요약바(표시 전용). */
  onClick?: () => void
  className?: string
  /**
   * 공개 시각 — 공개 전 레시피를 운영자에게 보여 줄 때만 서버가 채운다(티켓 20261001_1159). 값이
   * 있으면 「공개 예정 · 10월 6일 오후 3시 30분」 한 줄을 더 그린다. 공개 전인지는 서버가 정해서
   * 내려주므로 여기서 `new Date()`로 다시 계산하지 않는다. 없으면 지금과 똑같은 렌더다.
   */
  releaseAt?: string | null
}

/**
 * 레시피 보상 요약 행 — 레시피 탐색 목록의 각 행과 믹서 상단 요약바가 완전히 같은 컴포넌트를
 * 공유한다(티켓 20260917_2014). `@/components/ui/ListRowCard`(서비스 구현)를 감싸는 얇은
 * 어댑터다 — MODULAR의 동명 컴포넌트(`design-system/components/patterns/ListRowCard.jsx`)는
 * 병존 구현(서비스에 반영되지 않음)이라 쓰지 않는다.
 *
 * 3케이스:
 * - 배지 + 포인트: icon=배지 이미지, subtitle=등급 칩+배지명, trailing=포인트 값
 * - 배지만: icon=배지 이미지, subtitle=등급 칩+배지명, trailing 없음
 * - 포인트만: icon=포인트 아이콘, subtitle 없음, trailing=포인트 값
 *
 * `releaseAt`이 있으면 위 3케이스 어느 쪽이든 텍스트 영역 맨 아래에 「공개 예정」 줄을 하나 더 그린다.
 * 보상 배지가 여러 개면 대표(첫 번째)만 노출하고 "+N"을 붙인다.
 * 타이틀 우측에는 슬롯 개수를 회색 원형 배지 안 숫자로 표시한다 — `ListRowCard`의 `title`이
 * string만 받아 칩을 인라인으로 못 붙이므로 `children`(전체 커스텀 렌더링)으로 우회한다.
 */
export default function RecipeRewardRow({
  title,
  slotCount,
  badges,
  points,
  onClick,
  className = '',
  releaseAt,
}: Props) {
  const hasBadges = badges.length > 0
  const hasPoints = points > 0
  const primary = badges[0]
  const extraCount = badges.length - 1

  const icon =
    hasBadges && primary ? (
      <div className="relative w-10 h-10 rounded-[var(--radius-pill)] bg-surface flex items-center justify-center overflow-hidden">
        <SafeImage
          src={primary.image_url}
          alt={primary.name}
          width={40}
          height={40}
          className="object-contain w-full h-full"
          fallback={<PackageIcon className="w-5 h-5 text-text/40" />}
        />
      </div>
    ) : (
      <div className="w-10 h-10 rounded-[var(--radius-pill)] bg-surface flex items-center justify-center">
        <CoinIcon className="w-5 h-5 text-text/60" />
      </div>
    )

  const subtitle =
    hasBadges && primary ? (
      <div className="flex items-center gap-[var(--spacing-4)] min-w-0">
        <RarityBadge rarity={primary.rarity} />
        <span className="truncate">
          {primary.name}
          {extraCount > 0 ? ` +${extraCount}` : ''}
        </span>
      </div>
    ) : undefined

  const trailing = hasPoints ? (
    <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text">
      {points.toLocaleString()}
    </span>
  ) : undefined

  return (
    <ListRowCard icon={icon} trailing={trailing} onClick={onClick} className={className}>
      <p className="flex items-center gap-[var(--spacing-4)] min-w-0">
        <span className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text truncate">
          {title}
        </span>
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-[length:var(--text-caption)] leading-none text-[var(--color-text-secondary)] bg-surface rounded-[var(--radius-pill)]">
          {slotCount}
        </span>
      </p>
      {subtitle !== undefined && <div className="mt-0.5">{subtitle}</div>}
      {releaseAt && (
        // 말줄임(truncate)을 쓰지 않는다 — 날짜가 정보라서다. 폭이 모자라면 두 조각 중 날짜 조각이
        // 통째로 다음 줄로 내려간다(조각 안에서는 끊기지 않는다).
        <p className="mt-[var(--spacing-4)] flex flex-wrap gap-x-[var(--spacing-4)] text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-[color:var(--color-warning)]">
          <span className="whitespace-nowrap">{d.combine.releaseScheduled} ·</span>
          <span className="whitespace-nowrap">{formatKoreanDateTime(releaseAt, { time: true })}</span>
        </p>
      )}
    </ListRowCard>
  )
}
