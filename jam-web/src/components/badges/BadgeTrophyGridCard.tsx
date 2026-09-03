'use client'

import Image from 'next/image'
import Link from 'next/link'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRarity } from '@/types/database'

export interface BadgeTrophyGridCardProps {
  name: string
  imageUrl?: string | null
  rarity: BadgeRarity
  href: string
  /** false = 썸네일 흑백+반투명 처리 (미획득 배지). */
  earned: boolean
}

const BASE =
  'flex flex-col items-center h-full rounded-[var(--radius-card)] p-[var(--spacing-12)] overflow-hidden active:scale-95 transition-transform duration-100'

/** BadgeStageRail.jsx 카드 배경과 동일한 레시피 — 페이지 캔버스(bg-surface)와 같은 색이면
 * 카드 경계가 안 보인다(인터랙션 리뷰 지적, 티켓 20260903_2329). */
const CARD_STYLE = {
  background:
    'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
}

/**
 * BadgeTrophyGridCard — 배지 트리(/badges/tree) 트로피 그리드(독립 배지) 전용 셀.
 * 티켓 20260903_2329(게이트 리뷰 FAIL 수정).
 *
 * 원래 이 셀은 `BadgeGridCard`(src/components/ui/)를 그대로 재사용했는데, 그 컴포넌트에
 * 박힌 `truncate`가 "불타는 금요일 밤 산책"·"일요일 새벽의 수도승" 같은 6자 이상 배지
 * 이름을 잘라버렸다 — 이번 리뉴얼의 출발점이었던 결함(§01)이 트로피 그리드에는 그대로
 * 남아 있었다. `BadgeGridCard.tsx`는 /badges·/collections·/combine·/profile·/inventory 등
 * 여러 화면이 공유하는 전역 컴포넌트라 truncate 자체를 고치면 그 화면들에도 영향을
 * 준다 — 그래서 마크업·클래스 컨벤션은 그대로 가져오되(같은 셀처럼 보이게) 이름 줄바꿈만
 * `overflow-wrap: anywhere`로 바꾼 트로피 그리드 전용 셀을 별도로 둔다. 레일
 * (`BadgeStageRail`)의 계열명 처리와 동일한 원칙이다.
 *
 * 트로피 그리드는 항상 href 이동(잠금 시트 없음)·undiscovered 없음이라 `BadgeGridCard`가
 * 지원하는 button 모드·selected·highlighted 등은 옮기지 않았다(이번 사용처에 없는 prop).
 */
export default function BadgeTrophyGridCard({ name, imageUrl, rarity, href, earned }: BadgeTrophyGridCardProps) {
  const thumbnailCls = [
    'w-[90px] h-[90px] rounded-[var(--radius-card)] overflow-hidden',
    'flex items-center justify-center',
    !earned && 'grayscale opacity-40',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Link href={href} className={BASE} style={CARD_STYLE}>
      <div className={thumbnailCls}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            width={90}
            height={90}
            className="w-full h-full object-contain p-1"
          />
        ) : (
          <MedalIcon className="w-10 h-10 text-text/30" />
        )}
      </div>
      <p className="text-[13px] font-bold text-text text-center w-full leading-tight pt-[var(--spacing-8)] [overflow-wrap:anywhere]">
        {name}
      </p>
      {/* mt-auto로 카드 하단에 고정 — 이름이 1~2줄을 오가도 같은 행의 칩 위치가
       * 흔들리지 않는다(인터랙션 리뷰 지적, 티켓 20260903_2329). BASE의 h-full +
       * 그리드의 기본 align-items:stretch로 카드가 행 높이만큼 늘어나는 것에 의존한다. */}
      <div className="mt-auto pt-[var(--spacing-4)]">
        <RarityBadge rarity={rarity} />
      </div>
    </Link>
  )
}
