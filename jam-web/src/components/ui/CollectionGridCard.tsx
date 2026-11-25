'use client'

import Link from 'next/link'
import SafeImage from '@/components/SafeImage'
import { MagicBookIcon } from '@/components/ui/icons'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import type { BadgeRarity } from '@/types/database'
import type { ReactNode } from 'react'

export interface CollectionGridCardProps {
  name: string
  imageUrl?: string | null
  /** 수집한 슬롯 수 */
  collected: number
  /** 전체 슬롯 수 */
  total: number
  /** 완성 여부 — 카드 면이 검정이 되고, 진행 바·숫자 자리에 등급 칩(`rarities`)이 온다 */
  completed?: boolean
  /**
   * 완성 카드의 맨 아래 행에 칩으로 그릴 등급들(낮은 등급부터 넘긴다). 컬렉션이 4등급이라 하나로 대표할 수 없어
   * 배지 목록은 «내가 장착한 배지의 등급»을 넘긴다(티켓 20261117_1856). Common도 그린다(2026-11-25 사용자 지시).
   * 완성하지 않은 카드는 이 값을 그리지 않는다.
   */
  rarities?: BadgeRarity[]
  /** 진행 바와 「수집/전체」 숫자를 숨긴다. 전체 슬롯 수를 아직 모르는 운영툴 미리보기용이다. 기본은 끔. */
  hideProgress?: boolean
  href?: string
  onClick?: () => void
  className?: string
  children?: ReactNode
}

// 카드 면 레시피(티켓 20261107_2246): BadgeGridCard와 같은 면 — --card-bg + 반경 16 + 안쪽 여백 12, 외곽선·그림자 없음.
// 완성한 카드는 면만 검정(--accent)이고 글자는 --accent-foreground다(2026-11-25 사용자 지시, 티켓 20261125_1113. 이전 면은 강조색 그린, 티켓 20261114_1502).
// 그림자·외곽선은 더하지 않는다.
const BASE = 'flex flex-col gap-2 rounded-2xl p-3'
const FACE_DEFAULT = 'bg-card-bg'
const FACE_COMPLETED = 'bg-accent'

export default function CollectionGridCard({
  name,
  imageUrl,
  collected,
  total,
  completed = false,
  rarities = [],
  hideProgress = false,
  href,
  onClick,
  className = '',
  children,
}: CollectionGridCardProps) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  // 눌림은 공용 `.jam-press`(0.98배·80ms, 동작 줄이기 설정에서는 없음)다. 링크도 버튼도 아닌 카드에는 붙이지 않는다.
  const cls = [BASE, completed ? FACE_COMPLETED : FACE_DEFAULT, (href || onClick) && 'jam-press', className].filter(Boolean).join(' ')

  const content = (
    <>
      {/* 썸네일 — 정사각형. 안쪽 여백 없이 칸을 채운다: 표지(생성기, 티켓 20261124_1741)는 꽉 찬 정사각형이라
          여백이 있으면 테두리처럼 보인다(티켓 20261124_2003). object-contain이라 정사각형이 아닌 이미지는 잘리지 않는다.
          컬렉션 이미지는 어드민 자유 입력이 가능했던 필드라 SafeImage로 렌더한다. next/image에
          직접 넘기면 카드 한 장 때문에 그리드가 있는 화면 전체가 500이 된다 (20260824_005).
          폴백은 이미지가 없을 때와 같은 MagicBookIcon — 카드 골격과 진행도는 그대로 남는다. */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden flex items-center justify-center">
        <SafeImage
          src={imageUrl}
          alt={name}
          className="object-contain"
          sizes="50vw"
          fallback={<MagicBookIcon className={`w-10 h-10 ${completed ? 'text-accent-foreground' : 'text-muted'}`} />}
        />
      </div>

      {/* 타이틀 */}
      <p className={`text-[15px] font-bold leading-[18px] truncate ${completed ? 'text-accent-foreground' : 'text-foreground'}`}>{name}</p>

      {/* 맨 아래 한 행 — 높이는 칩 높이(20px)로 맞춰 완성·미완성 카드의 높이가 같다.
          완성: 바·숫자 없이 등급 칩들(왼쪽 정렬, 이름과 같은 시작선, 낮은 등급부터, Common은 칩이 없다). «완성» 칩은 없앴다 — 검정 면이 완성을 알린다
          (2026-11-25 사용자 지시, 티켓 20261125_1113). 썸네일 위에는 등급 칩을 얹지 않는다.
          미완성: 진행 바 + 「수집/전체」 숫자. */}
      {(completed || !hideProgress) && (
        <div className={`flex items-center min-h-5 ${completed ? 'flex-wrap gap-1' : 'gap-2'}`}>
          {completed ? (
            rarities.map((r) => <RarityBadge key={r} rarity={r} size="md" />)
          ) : (
            <>
              {/* 캡슐 모양 바 — 어두운 트랙과 채움색이 홈 캡슐 게이지와 같다(채움 `--capsule-fill`, 2026-11-25 사용자 지시, 티켓 20261125_1113).
                  모양은 티켓 20261114_1502. 컬렉션 상세·인벤토리의 바는 강조색 그린 채움 그대로다. */}
              <ProgressBar shape="capsule" percent={pct} height={16} color="var(--capsule-fill)" />
              <span className="text-xs text-[color:var(--link)] font-bold leading-none tabular-nums shrink-0">
                {collected}/{total}
              </span>
            </>
          )}
        </div>
      )}

      {children}
    </>
  )

  if (href) return <Link href={href} className={cls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>
  return <div className={cls}>{content}</div>
}
