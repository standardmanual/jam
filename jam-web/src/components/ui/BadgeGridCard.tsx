'use client'

import SafeImage from '@/components/SafeImage'
import Link from 'next/link'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { BadgeLevelChip } from '@ds/components/cards/BadgeLevelChip'
import { LockedTile } from '@ds/components/cards/LockedTile'
import { MedalIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'
import type { ReactNode } from 'react'

export interface BadgeGridCardProps {
  /** 배지 이름. `locked`이면 그리지 않는다(가린 이름이 대신 나온다) — 그래서 `locked`일 때는 생략해도 된다 */
  name?: string
  /** 배지 그림. `locked`이면 넘어와도 그리지 않는다 */
  imageUrl?: string | null
  /**
   * 배지 등급. **null이면 무한레벨형이라 등급 칩을 그리지 않는다**
   * (마이그레이션 130 — `badges.rarity` nullable, 티켓 20260905_0027).
   * Lv.N 칩 자체는 티켓 20260905_0036(MODULAR 배지 컴포넌트) 범위다.
   */
  rarity: BadgeRarity | null
  /**
   * 레벨형 배지의 Lv.N (티켓 20260905_0038 B). 값이 있으면 등급 칩 대신 `BadgeLevelChip`을
   * 그린다 — `rarity`가 NULL인 배지에 `RarityBadge`를 넘기면 칩이 조용히 사라진다(0036).
   * 배지 상세(`BadgeHeroSection`)·피드(`FeedSection`)가 같은 분기를 쓴다.
   */
  level?: number | null
  /**
   * 획득 횟수. 2 이상일 때만 썸네일 모서리에 «×N»을 그린다(1회는 표시하지 않는다).
   * 시각 문법은 피드 카드의 카운터 필(`FeedSection.tsx`)과 같다 — 새 표현을 만들지 않는다.
   */
  count?: number | null
  /**
   * ×N 필의 접근성 문구를 교체한다. 기본값(`d.badges.earnCountAria`, "N번 획득했어요")은
   * "획득 이력" 맥락이다 — 드랍 그리드처럼 "지금 보유한 것 중 고르기" 맥락에서는 횟수가 아니라
   * 개수를 읽어야 뜻이 맞는다(20260908_0040). 화면마다 문구가 다를 수 있어 문자열을 직접
   * 호출부에서 넘긴다(i18n 그룹을 badges 하나로 고정하지 않기 위함).
   */
  countAriaText?: string
  /** Link mode — wraps card in <Link href>. Mutually exclusive with onClick. */
  href?: string
  /** Button mode — wraps card in <button>. Mutually exclusive with href. */
  onClick?: () => void
  /**
   * href와 함께 쓸 때만 의미가 있는 클릭 핸들러 (20260902_0923).
   * Link 이동 직전에 부수효과(예: 잔존 location.hash 제거)를 실행하고 싶을 때 사용한다.
   */
  onNavigate?: () => void
  /** false = 썸네일 흑백+반투명 처리 (미획득 배지). 기본값 true. `undiscovered`가 함께 오면 그쪽이 이긴다. */
  earned?: boolean
  /**
   * true = 썸네일을 이미지 바깥 윤곽의 회색 실루엣으로, 이름은 그대로 보여 준다(아이템북 미발견 배지, 티켓 20261102_1834).
   * 등급 칩과 ×N은 그리지 않는다. `earned={false}`가 함께 와도(`SlotGrid`의 실제 조합) 실루엣이 이긴다.
   */
  undiscovered?: boolean
  /** 선택 강조 링 (select 모드). */
  selected?: boolean
  /**
   * 컬렉션 슬롯 장착 모드(`/collections/[id]?slot=1`)에서 "지금 넣을 수 있는 칸"을
   * 짚어준다(`SlotGrid.tsx`). `selected`(선택 상태)와 의미가 달라 별도 prop으로 둔다.
   * (알림함 배지/인벤토리 목록 착지 시의 최근 획득 하이라이트는 20260826_006에서 제거됨)
   */
  highlighted?: boolean
  /**
   * 잠긴 아이템 배지(열기 전, 티켓 20261018_0054 2회). 썸네일 자리에 `LockedTile`, 이름 줄은 `d.lockedItem.card.name`이고
   * 등급 칩 아래에는 아무것도 붙지 않는다(티켓 20261028_1741 2회 — 여는 비용이 채운 잼에서 포인트로 바뀌어 게이지를 걷어냈다).
   * `imageUrl`·`name`이 넘어와도 그리지 않는다 — 호출부 실수로 가림이 뚫리지 않게 컴포넌트가 막는다.
   * 디자인 시스템 사본(`design-system/components/patterns/BadgeGridCard`)에는 게이지가 남아 있다(후속 동기화 몫).
   */
  locked?: boolean
  /**
   * true = 이름을 연한 그레이(`--base-neutral-400`, #a3a3a3)로 그린다. 아직 장착하지 않은 칸(비어 있거나 넣을 수 있는 배지가
   * 있는 칸)에서 장착된 칸과 이름 색으로 구분하려고 컬렉션 상세가 쓴다(2026-11-09 사용자 지시, 처음에는 `text-muted`였다가
   * «더 흐린 그레이»로 바꿨다). 썸네일 별·미발견 실루엣의 회색(중립 400)과 같은 단계다. 흰 면 위 대비는 약 2.5:1로 낮다 —
   * 비활성 칸이라는 뜻이고 기본 false라 다른 화면은 그대로다.
   */
  nameMuted?: boolean
  /**
   * true = 등급 칩(`RarityBadge`·`BadgeLevelChip`)을 회색조(`grayscale`)로 그린다. 장착하지 않은 칸에서 이름·썸네일과 함께
   * 비활성으로 보이게 하려고 컬렉션 상세가 쓴다(2026-11-09 사용자 지시). 칩의 면 색(`--rarity-*`)은 바꾸지 않고
   * 그려진 뒤 필터만 건다. 기본 false라 다른 화면은 마크업이 그대로다.
   */
  chipGray?: boolean
  className?: string
  /** 희귀도 배지 아래 추가 콘텐츠 (만료일, 슬롯 버튼 등). */
  children?: ReactNode
}

// 카드 면 레시피(티켓 20261107_2203): 카드 면(--card-bg) + 반경 16, 외곽선·그림자 없음.
// 경계는 카드 사이 간격이 맡는다. 면은 선택 여부로 한쪽만 고른다(아래 `containerCls`).
const BASE =
  'flex flex-col items-center rounded-2xl p-3 overflow-hidden'

// 미발견 실루엣 (티켓 20261102_1834) — 원본 <img> 한 장을 검정으로 만든 뒤(brightness-0, 알파는 그대로) 중립 400 단계로 올린다(invert-[.64]).
// 0.64는 중립 400 단계와 같은 밝기다. 필터는 CSS 변수 색을 받지 못해 숫자로 적는다.
// 래퍼가 아니라 <img>에만 건다: 래퍼에 걸면 대체 아이콘(MedalIcon)까지 검정으로 칠해지고 ×N 필 기준점과도 겹친다.
// 2026-09-06 «미획득은 원본 그레이»를 되돌린 것이 아니다 — 미발견만 실루엣 예외이고 `earned={false}`는 grayscale을 그대로 쓴다.
export const UNDISCOVERED_SILHOUETTE_CLASS = 'brightness-0 invert-[.64]'

export default function BadgeGridCard({
  name = '',
  imageUrl,
  rarity,
  level = null,
  count = null,
  countAriaText,
  href,
  onClick,
  onNavigate,
  earned = true,
  undiscovered = false,
  selected = false,
  highlighted = false,
  locked = false,
  nameMuted = false,
  chipGray = false,
  className = '',
  children,
}: BadgeGridCardProps) {
  const isInteractive = !!(href || onClick)

  const containerCls = [
    BASE,
    // 면은 항상 --card-bg이고, 선택은 블랙 2px 링(box-shadow라 레이아웃을 밀지 않는다)으로 말한다. 새 색을 만들지 않는다(티켓 20261107_2246).
    'bg-card-bg',
    selected && 'ring-2 ring-foreground',
    isInteractive && 'active:scale-95 transition-transform duration-100',
    // 컬렉션 슬롯 장착 모드 하이라이트 — 그리드에서 한 칸을 찾아내야 하므로 배경톤만으로는 약하다
    highlighted && 'shadow-[inset_0_0_0_2px_var(--link)]',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // 판정 순서: undiscovered(실루엣) > !earned(grayscale + opacity-40). 미발견 칸은 earned=false도 함께 오므로 순서가 바뀌면 실루엣이 사라진다
  const thumbDimmed = !earned && !undiscovered

  const thumbnailCls = [
    'w-full aspect-square rounded-2xl overflow-hidden',
    'flex items-center justify-center',
    thumbDimmed && 'grayscale opacity-40',
  ]
    .filter(Boolean)
    .join(' ')

  const showCount = !locked && !undiscovered && typeof count === 'number' && count > 1
  // 회색조는 칩 자체에 `grayscale`을 걸어 만든다. 래퍼를 두면 Common처럼 칩이 아무것도 그리지 않을 때도 빈 래퍼가 남아
  // 이름과 칩 사이 간격(gap-1)만큼 칸이 커진다(장착 상태와 칸 높이가 어긋났다).
  const chipClass = chipGray ? 'grayscale' : ''
  const chip = level != null
    ? <BadgeLevelChip level={level} size="md" className={chipClass} />
    : <RarityBadge rarity={rarity ?? undefined} size="md" className={chipClass} />

  const content = (
    <>
      {/*
        카운터 필의 기준점 — 썸네일 자체에 relative를 걸면 grayscale 필터가 필까지 먹는다.
        w-full max-w-[90px]로 폭을 명시해야 한다: 부모(BASE)가 flex-col items-center라 자식
        폭이 stretch가 아닌 shrink-to-fit으로 결정되는데, 이 wrapper에 폭이 없으면 그 안의
        thumbnailCls(w-full)가 부모의 100%를 요구하는 순환 참조가 생겨 0×0으로 collapse된다
        (티켓 20260907_2138, 직전 시도 게이트 리뷰 FAIL 사유).
      */}
      <div className="relative w-full max-w-[90px]">
        {locked ? (
          // 잠긴 개체는 어떤 배지인지 알 수 있는 그림을 그리지 않는다(운영 로직 7.3절). 호출부가 URL을 넘겨도 쓰지 않는다
          <LockedTile size={90} />
        ) : (
          <div className={thumbnailCls}>
            <SafeImage
              src={imageUrl}
              alt={name}
              width={90}
              height={90}
              className={undiscovered ? `w-full h-full object-contain p-1 ${UNDISCOVERED_SILHOUETTE_CLASS}` : 'w-full h-full object-contain p-1'}
              fallback={<MedalIcon className="w-10 h-10 text-muted" />}
            />
          </div>
        )}
        {showCount && (
          // 피드 카드의 카운터 필과 같은 시각 문법(20260905_0038 B). 횟수는 아래 이름 줄이
          // 아니라 썸네일에 붙어야 「이 배지를」 몇 번인지가 한눈에 붙는다.
          <span
            className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-surface border border-[color:var(--border)] text-xs leading-none font-bold text-foreground flex items-center justify-center"
            aria-hidden="true"
          >
            ×{count}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 pt-2 w-full">
        <p className={`text-sm font-bold ${nameMuted ? 'text-[color:var(--base-neutral-400)]' : 'text-foreground'} text-center ${locked ? 'line-clamp-3' : 'line-clamp-2'} w-full leading-tight break-keep wrap-break-word`}>
          {locked ? d.lockedItem.card.name : name}
        </p>
        {/* ×N은 aria-hidden이라 보조기술에는 이 문장만이 횟수를 전달한다 */}
        {showCount && (
          <span className="sr-only">{countAriaText ?? t(d.badges.earnCountAria, { count: String(count) })}</span>
        )}
        {!undiscovered && chip}
      </div>
      {children && <div className="w-full mt-1">{children}</div>}
    </>
  )

  if (href) return <Link href={href} onClick={onNavigate} className={containerCls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={containerCls}>{content}</button>
  return <div className={containerCls}>{content}</div>
}
