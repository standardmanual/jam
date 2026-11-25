'use client'

import SafeImage from '@/components/SafeImage'
import VisitCountChip from '@/components/ui/VisitCountChip'
import Link from 'next/link'
import { RarityBadge } from '@/components/ui/RarityBadge'
import { BadgeLevelChip } from '@/components/ui/BadgeLevelChip'
import { LockedTile } from '@/components/ui/LockedTile'
import { SlotOutline } from '@/components/ui/SlotOutline'
import { BADGE_CARD_DISPLAY_WIDTH, slotOutlineTraceSrc } from '@/lib/imageSrc'
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
   * true = 이미지를 그리지 않고 이미지 알파 윤곽을 따라가는 점선(`SlotOutline`)만 그린다. 이름은 그대로 보여 준다
   * (아이템북 후보가 없는 칸, 티켓 20261112_1627 — 이전의 회색 실루엣 채움을 대신한다). 추적에 실패하거나 이미지 주소가 없으면 둥근 사각형 점선이다.
   * 등급 칩과 ×N은 그리지 않는다. `earned={false}`가 함께 와도(`SlotGrid`의 실제 조합) 점선이 이긴다.
   */
  undiscovered?: boolean
  /**
   * true = 이미지(`earned={false}`면 grayscale + opacity-40) 위에 같은 점선을 불투명 100%로 겹친다 — 지금 넣을 수 있는 칸
   * (컬렉션 `isSlottable`, 믹스 `addable`, 티켓 20261112_1627). 점선은 이미지 래퍼의 형제라 이미지 투명도의 영향을 받지 않는다.
   * 추적에 실패하면 이미지가 보이므로 사각형 대체 없이 그리지 않는다. `undiscovered`·`locked`가 함께 오면 그쪽이 이긴다.
   */
  outlined?: boolean
  /** 선택 강조 링 (select 모드). */
  selected?: boolean
  /** 고르면 실행되는 카드가 «지금 고른 것»임을 보조기술에 알린다(`aria-pressed`). `onClick` 카드에만 붙는다(티켓 20261110_2150) */
  pressed?: boolean
  /** `onClick` 카드를 막는다(`<button disabled>`) — 요청 중 다른 카드를 눌러도 반응하지 않게 할 때 쓴다 */
  disabled?: boolean
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
   */
  locked?: boolean
  /**
   * true = 이름을 연한 그레이로 그린다: `text-muted`(#666)에 `opacity-60`을 건다. 흰 카드 면 위에서 #a3a3a3(중립 400)과 같은 밝기라
   * 썸네일 별·미발견 실루엣의 회색과 같은 단계다. 원시 색 토큰(`--base-*`)은 공통 컴포넌트에서 쓰지 않는 규칙이라(`commonLiteralColors`)
   * 역할 토큰 + 불투명도로 만들었다. 아직 장착하지 않은 칸(비어 있거나 넣을 수 있는 배지가 있는 칸)에서 장착된 칸과 이름 색으로
   * 구분하려고 컬렉션 상세가 쓴다(2026-11-09 사용자 지시, 처음에는 `text-muted`였다가 «더 흐린 그레이»로 바꿨다).
   * 흰 면 위 대비가 약 2.5:1로 낮다 — 비활성 칸이라는 뜻이고 기본 false라 다른 화면은 그대로다.
   */
  nameMuted?: boolean
  /** true = 썸네일의 지연 로딩을 끈다. 그리드 앞 칸(첫 화면)에 쓴다 (티켓 20261115_1237). 기본 false */
  eager?: boolean
  /**
   * 방문 횟수. 2 이상이면 이름 아래, 등급 칩 자리에 «×N» 칩을 그린다(체크인 배지 목록, 2026-11-09 사용자 지시).
   * 1회는 칩을 그리지 않는다(사용자 지시). 썸네일 모서리의 «×N» 필(`count`)과 다른 표현이다 — 이쪽은 등급 칩과 같은 크기(md)의 칩이다.
   * 면은 레벨 칩과 같은 `--default-soft`다. 기본값이 없어 다른 화면은 그대로다.
   */
  visitCount?: number | null
  /**
   * true = 등급이 Common인 배지도 `Common` 칩을 그린다. 기본 false — 다른 화면은 Common 칩을 그리지 않는다(노이즈 축소,
   * 티켓 20260827_024). 액티비티 배지 목록이 켠다(2026-11-09 사용자 지시).
   */
  showCommonChip?: boolean
  /**
   * true = 등급 칩(`RarityBadge`·`BadgeLevelChip`)을 회색조(`grayscale`)로 그린다. 장착하지 않은 칸에서 이름·썸네일과 함께
   * 비활성으로 보이게 하려고 컬렉션 상세가 쓴다(2026-11-09 사용자 지시). 칩의 면 색(`--rarity-*`)은 바꾸지 않고
   * 그려진 뒤 필터만 건다. 기본 false라 다른 화면은 마크업이 그대로다.
   */
  chipGray?: boolean
  /**
   * true = 좁은 칸용 고정 규격(체크인 지점 카드의 3열 갤러리, 티켓 20261114_2352). 여백 4, 면 `--background-secondary`,
   * 썸네일은 칸 폭에서 좌우 여백 4를 뺀 정사각형(위 여백과 같은 4, 면 `--surface`, 모서리는 카드 반경 16에서 여백 4를 뺀 12, 티켓 20261115_2045),
   * 이름 12px 굵게 2줄(1줄 이름도 2줄 높이), 칩 줄은 칩이 그려질 때만 높이 24(등급 칩만, Common이면 줄이 없다 — 티켓 20261117_1822).
   * 만료·방문 횟수·children·미발견·외곽선 표현은 그리지 않는다. 기본 false라 다른 화면은 마크업이 그대로다.
   */
  compact?: boolean
  className?: string
  /** 희귀도 배지 아래 추가 콘텐츠 (만료일, 슬롯 버튼 등). */
  children?: ReactNode
}

// 카드 면 레시피(티켓 20261107_2203): 카드 면(--card-bg) + 반경 16, 외곽선·그림자 없음.
// 경계는 카드 사이 간격이 맡는다. 면은 선택 여부로 한쪽만 고른다(아래 `containerCls`).
const BASE =
  'flex flex-col items-center rounded-2xl p-3 overflow-hidden'

// compact: 여백 4, 면은 호출부 카드 면(--card-bg)과 겹치지 않게 --background-secondary(위 containerCls)
const BASE_COMPACT = 'flex flex-col items-center rounded-2xl p-1 overflow-hidden'

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
  outlined = false,
  selected = false,
  pressed,
  disabled = false,
  highlighted = false,
  locked = false,
  nameMuted = false,
  eager = false,
  visitCount = null,
  showCommonChip = false,
  chipGray = false,
  compact = false,
  className = '',
  children,
}: BadgeGridCardProps) {
  const isInteractive = !!(href || onClick)

  const containerCls = [
    // compact는 여백과 면을 분기로 한쪽만 넣는다(클래스 순서에 기대지 않는다)
    compact ? BASE_COMPACT : BASE,
    // 면은 일반·compact 모두 회색 단색(--background-secondary)이고, 선택은 블랙 2px 링(box-shadow라 레이아웃을 밀지 않는다)으로 말한다(티켓 20261125_1649).
    'bg-background-secondary',
    selected && 'ring-2 ring-foreground',
    isInteractive && 'active:scale-95 transition-transform duration-100',
    // 컬렉션 슬롯 장착 모드 하이라이트 — 그리드에서 한 칸을 찾아내야 하므로 배경톤만으로는 약하다
    highlighted && 'shadow-[inset_0_0_0_2px_var(--link)]',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // 판정 순서: undiscovered(이미지 없이 점선만) > !earned(grayscale + opacity-40). 미발견 칸은 earned=false도 함께 오므로 순서가 바뀌면 점선이 사라진다
  const thumbDimmed = !earned && !undiscovered
  // 점선이 추적할 주소. w=256, q=75 — 폭 90 이미지가 이미 받는 변환본이라 새 변환본이 생기지 않는다(`slotOutlineTraceSrc`)
  const outlineSrc = slotOutlineTraceSrc(imageUrl)

  // 일반 카드의 썸네일은 카드 가장자리에서 6px 안쪽 면이다(시안은 카드 폭의 약 5%, 사용자 지시 2026-11-20, 티켓 20261120_1143).
  // 카드 여백(p-3 = 12)보다 6px 키워 위·좌·우 6px만 남기고, 이름·칩 줄의 여백(12)은 그대로 둔다. 모서리 둥글기는 그대로 rounded-2xl이다.
  // 글로우 없는 카드·잠김·미발견 칸도 같은 크기라 한 그리드 안에서 어긋나지 않는다. compact는 별도 고정 규격(여백 4)이라 이 분기에 들어오지 않는다
  const thumbnailCls = [
    'w-full aspect-square rounded-2xl overflow-hidden bg-background-secondary',
    'flex items-center justify-center',
    thumbDimmed && 'grayscale opacity-40',
  ]
    .filter(Boolean)
    .join(' ')

  const showCount = !locked && !undiscovered && typeof count === 'number' && count > 1
  // 회색조는 칩 자체에 `grayscale`을 걸어 만든다. 래퍼를 두면 Common처럼 칩이 아무것도 그리지 않을 때도 빈 래퍼가 남아
  // 이름과 칩 사이 간격(gap-1)만큼 칸이 커진다(장착 상태와 칸 높이가 어긋났다).
  const chipClass = chipGray ? 'grayscale' : ''
  // 칩이 실제로 그려지는지: Lv 칩은 항상, 등급 칩은 등급이 있고 Common이 아닐 때(`showCommonChip`이면 Common도)
  const hasChip = level != null || (rarity != null && (rarity !== 'common' || showCommonChip))
  const chip = level != null
    ? <BadgeLevelChip level={level} size="md" tone="common" className={chipClass} />
    : <RarityBadge rarity={rarity ?? undefined} size="md" tone="common" className={chipClass} showCommon={showCommonChip} />

  if (compact) {
    const compactContent = (
      <>
        {/* 썸네일은 칸 폭에서 좌우 여백(4)을 뺀 정사각형이라 위 여백(4)과 좌우 여백이 같다. 모서리는 카드 반경 16 − 여백 4 = 12(`rounded-xl`)이다(티켓 20261115_2045) */}
        <div className="relative w-full aspect-square shrink-0">
          {locked ? (
            <LockedTile size={72} style={{ width: '100%', borderRadius: 'var(--radius-xl)' }} />
          ) : (
            <div
              className={`w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center bg-background-secondary ${thumbDimmed ? 'grayscale opacity-40' : ''}`}
            >
              <SafeImage
                src={imageUrl}
                alt={name}
                width={72}
                height={72}
                eager={eager}
                variantWidth={BADGE_CARD_DISPLAY_WIDTH}
                className="w-full h-full object-contain p-1"
                fallback={<MedalIcon className="w-6 h-6 text-muted" />}
              />
            </div>
          )}
          {showCount && (
            <span
              className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-surface border border-[color:var(--border)] text-xs leading-none font-bold text-foreground flex items-center justify-center"
              aria-hidden="true"
            >
              ×{count}
            </span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1 pt-2 w-full">
          <p className={`text-xs font-bold ${nameMuted ? 'text-muted opacity-60' : 'text-foreground'} text-center line-clamp-2 min-h-[30px] w-full leading-tight break-keep wrap-break-word`}>
            {locked ? d.lockedItem.card.name : name}
          </p>
          {showCount && (
            <span className="sr-only">{countAriaText ?? t(d.badges.earnCountAria, { count: String(count) })}</span>
          )}
          {/* 칩이 그려질 때만 높이 24의 줄을 둔다. 칩이 없으면 줄도 없어 칸이 이름 아래에서 끝난다(다른 BadgeGridCard와 같은 규칙, 티켓 20261117_1822).
              같은 행 안에서는 그리드 정렬(stretch)이 가장 큰 칸 높이로 맞춘다 */}
          {hasChip && <div className="h-6 flex items-center justify-center">{chip}</div>}
        </div>
      </>
    )
    if (href) return <Link href={href} onClick={onNavigate} className={containerCls}>{compactContent}</Link>
    if (onClick) return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed} className={containerCls}>{compactContent}</button>
    return <div className={containerCls}>{compactContent}</div>
  }

  const content = (
    <>
      {/*
        카운터 필의 기준점 — 썸네일 자체에 relative를 걸면 grayscale 필터가 필까지 먹는다.
        w-full max-w-[90px]로 폭을 명시해야 한다: 부모(BASE)가 flex-col items-center라 자식
        폭이 stretch가 아닌 shrink-to-fit으로 결정되는데, 이 wrapper에 폭이 없으면 그 안의
        thumbnailCls(w-full)가 부모의 100%를 요구하는 순환 참조가 생겨 0×0으로 collapse된다
        (티켓 20260907_2138, 직전 시도 게이트 리뷰 FAIL 사유).
      */}
      <div className="relative w-[calc(100%+0.75rem)] -mt-1.5">
        {locked ? (
          // 잠긴 개체는 어떤 배지인지 알 수 있는 그림을 그리지 않는다(운영 로직 7.3절). 호출부가 URL을 넘겨도 쓰지 않는다
          <LockedTile size={128} style={{ width: '100%' }} />
        ) : undiscovered ? (
          // 후보가 없는 칸: 이미지를 그리지 않고 이미지 윤곽의 점선만 둔다. SlotOutline이 정사각형 칸을 스스로 잡아 레이아웃이 밀리지 않는다.
          // 추적 실패·주소 없음이면 둥근 사각형 점선이다. 이름은 아래 줄이 전하므로 점선은 장식(aria-hidden)이다
          <SlotOutline src={outlineSrc} fallback="box" size={128} inset={6} style={{ maxWidth: 'none' }} />
        ) : (
          <>
            <div className={thumbnailCls}>
              <SafeImage
                src={imageUrl}
                alt={name}
                width={90}
                height={90}
                eager={eager}
                // 면이 커져도 그림이 면에서 차지하는 비율(약 91%)과 점선 윤곽(`SlotOutline`의 inset 4/90)이 그대로 맞도록 여백을 비율로 준다
                className="w-full h-full object-contain p-[4.4%]"
                fallback={<MedalIcon className="w-12 h-12 text-muted" />}
              />
            </div>
            {outlined && (
              // 이미지 래퍼의 형제: 래퍼 안에 두면 opacity-40을 먹어 점선이 흐려진다. 추적 실패 때는 이미지가 보이므로 사각형 대체가 없다
              <SlotOutline src={outlineSrc} fallback="none" size={128} inset={6} style={{ maxWidth: 'none' }} className="absolute inset-0 h-full w-full" />
            )}
          </>
        )}
        {showCount && (
          // 피드 카드의 카운터 필과 같은 시각 문법(20260905_0038 B). 횟수는 아래 이름 줄이
          // 아니라 썸네일에 붙어야 「이 배지를」 몇 번인지가 한눈에 붙는다.
          <span
            className={`absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-surface border border-[color:var(--border)] text-xs leading-none font-bold text-foreground flex items-center justify-center`}
            aria-hidden="true"
          >
            ×{count}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 pt-2 w-full">
        <p className={`text-sm font-bold ${nameMuted ? 'text-muted opacity-60' : 'text-foreground'} text-center ${locked ? 'line-clamp-3' : 'line-clamp-2'} w-full leading-tight break-keep wrap-break-word`}>
          {locked ? d.lockedItem.card.name : name}
        </p>
        {/* ×N은 aria-hidden이라 보조기술에는 이 문장만이 횟수를 전달한다 */}
        {showCount && (
          <span className="sr-only">{countAriaText ?? t(d.badges.earnCountAria, { count: String(count) })}</span>
        )}
        {!undiscovered && chip}
        {/* 방문 횟수 칩 — 2회 이상일 때만 그린다(`VisitCountChip`, 상세 히어로 카드와 같은 부품) */}
        {!undiscovered && <VisitCountChip count={visitCount} tone="common" />}
      </div>
      {children && <div className="w-full mt-1">{children}</div>}
    </>
  )

  if (href) return <Link href={href} onClick={onNavigate} className={containerCls}>{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed} className={containerCls}>{content}</button>
  return <div className={containerCls}>{content}</div>
}

/**
 * 인벤토리 빈 슬롯 플레이스홀더 — 일반 `BadgeGridCard`와 동일한 썸네일(`w-[calc(100%+0.75rem)] aspect-square`)·
 * 이름(`text-sm font-bold`)·칩(`h-6`) 기하를 공유해 채운 카드와 행 높이가 정확히 일치한다(사용자 결정 2026-11-25, 티켓 20261125_1444).
 * 면은 채운 카드와 같은 `--background-secondary`를 옅게(30%) 깐다 — 카드 면이 회색 단색으로 바뀐 티켓 20261125_1649와 맞춘다.
 */
export function BadgeGridCardPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div className={`${BASE} bg-background-secondary opacity-30${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className="relative w-[calc(100%+0.75rem)] -mt-1.5">
        <div className="w-full aspect-square rounded-2xl" />
      </div>
      <div className="flex flex-col items-center gap-1 pt-2 w-full">
        <p className="text-sm font-bold text-foreground text-center truncate w-full leading-tight">&nbsp;</p>
        <div className="h-6" />
      </div>
    </div>
  )
}
