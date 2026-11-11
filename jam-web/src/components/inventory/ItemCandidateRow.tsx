'use client'

import type { ReactNode } from 'react'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import LocalDate from '@/components/LocalDate'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { ListRowChip } from '@/components/ui/ListRow'
import { d } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'
import type { BadgeRarity } from '@/types/database'

// 20260908_0040: 장착 개체 선택 시트(20260907_2221)의 행을 공용 컴포넌트로 추출 —
// 드랍 개체 선택 시트(PoiCarouselModal)가 두 번째 사용처다. 시각·동작은 원본과 동일해야
// 한다(순수 리팩터). 컴포넌트 자체는 "선택" 동작만 책임지고, 요청 진행 중 표시(트레일링)와
// 선택 톤·비활성화는 호출부가 prop으로 넘긴다 — 호출부마다 요청 타이밍이 다르기 때문이다
// (장착 시트는 행 클릭이 곧 API 호출, 드랍 시트는 행 클릭이 로컬 선택일 뿐이다).

/** 일련번호 표시 포맷 — 서비스 전역 공통(4자리 prefix + 6자리 zero-pad). */
export function formatSerial(item: { serial_prefix: string | null; serial_number: number }): string {
  return `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`
}

/**
 * 만료 임박(7일 이내) 여부 — 개체 선택 시트 전용 판정.
 * `InventoryGrid.tsx`에도 같은 이름·같은 기준의 함수가 별도로 존재한다(인벤토리 목록 만료
 * 칩용). 두 화면의 만료 판정 기준이 우연히 같을 뿐 서로 다른 데이터 셰이프를 받으므로
 * 병합하지 않고 이 파일 안에서 독립적으로 둔다 — 병합 시 한쪽을 고치면 다른 쪽 회귀
 * 위험이 생긴다(20260908_0040 회귀 확인 포인트).
 */
export function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

/**
 * 선택 시트 행의 `ItemSerialCode` 높이(px). **행 폭 안에 들어가는지가 이 값의 제약이다.**
 *
 * 값의 근거(티켓 20261107_1946, 320px 뷰포트에서 `offsetWidth` 실측. 글꼴은 Noto Sans KR 대신 시스템 글꼴 폴백):
 *   - `ItemSerialCode` 총 폭 = height × 약 5.31 → height 40이면 212.4px, height 28이면 약 149px
 *   - 시트 좌우 패딩은 24씩이라 행 폭은 272px. `ListRow`의 본문 폭(번호가 쓸 수 있는 폭)은 상태마다 다르다
 *       기본 238 / 선택(체크 아이콘이 32px 차지) 206 / 선택 + «처리 중» trail 159
 *     옛 `ListRowCard`는 238 / 238 / 187이었다(선택 + «처리 중»은 40에서도 24.9px 넘쳤다)
 *   - 가장 좁은 상태(선택 + «처리 중», 159px)에 들어가야 하므로 28로 낮췄다(약 149px, 10px 여유).
 *     행을 고르는 순간 번호 크기가 바뀌면 안 되므로 상태와 상관없이 한 값을 쓴다
 *   - 40 아래는 `ItemSerialCode`의 자간 보간 하한(fontSize 20 = height 40)을 벗어나 자간이 +8%로 고정된다.
 *     캘리브레이션 범위 밖이라는 뜻이며, 글자 크기는 14px이다
 */
export const SELECT_SERIAL_HEIGHT_PX = 28

export interface ItemCandidate {
  id: string
  serial_number: number
  serial_prefix: string | null
  /** 만료 임박 칩("곧 만료")을 선택 시트에 띄우기 위한 값. 만료 없는 개체는 null. */
  expires_at: string | null
  /**
   * 잠긴 개체(티켓 20261018_1817). true이면 일련번호와 만료 칩을 그리지 않고 «N 포인트 필요»를 구분 값으로 보인다 —
   * 잠긴 개체는 어떤 아이템 배지인지 알 수 있는 값을 화면에 두지 않는다(운영 로직 7.3절). 이때 `serial_number`·`serial_prefix`는 쓰지 않는다.
   */
  locked?: boolean
  /**
   * 잠긴 개체를 여는 데 필요한 포인트(`inventory_items.unlock_points_required`, 배정 때 고정, 티켓 20261028_1741 2회).
   * 같은 등급의 잠긴 개체끼리 고를 근거가 이 값뿐이라 선택 시트에서만 보인다. 0이면 «포인트 없이 열 수 있어요», null(정책값)이면 구분 줄을 생략한다
   */
  unlock_points_required?: number | null
  /**
   * 이 개체의 등급(티켓 20261028_1408). 시트 한 곳에 등급이 다른 개체가 섞이는 호출부(컬렉션 등급이 아직 없을 때의 장착 시트)만 채운다.
   * 값이 있으면 행의 `rarity` prop보다 우선한다. 키가 없으면(드랍·픽업 시트) 지금처럼 `rarity` prop을 쓴다.
   */
  rarity?: BadgeRarity | null
}

interface ItemCandidateRowProps {
  candidate: ItemCandidate
  /** 무한레벨형 배지는 등급이 없다(마이그레이션 130) — null/undefined면 등급 칩을 그리지 않는다 */
  rarity: BadgeRarity | null | undefined
  /** 카드 썸네일에 쓰는 배지 그림 — 같은 배지의 개체들이라 시트가 한 장을 모두에게 준다(없으면 메달 아이콘) */
  imageUrl?: string | null
  /** 지금 고른 행(요청 진행 중이든 아니든) — 프라이머리 링으로 표시한다 */
  selected?: boolean
  /** 다른 행이 처리되는 동안 이 행을 눌러도 반응하지 않게 한다(시각적으로도 억제) */
  muted?: boolean
  /** 행 우측에 보여줄 보조 표시(예: "처리 중") */
  trailing?: ReactNode
  onClick: () => void
}

/**
 * 개체 선택 시트의 개체 한 장 — 인벤토리·컬렉션·배지 목록과 같은 `BadgeGridCard` 레이아웃이다(티켓 20261110_2150, 캔버스 «JAM! 바텀시트» 09번).
 * 카드에는 배지 이름 대신(이름은 시트 제목이 말한다) 일련번호 칩이 오고 그 아래에 등급 칩이 붙는다. 3열 카드 안에는 일련번호 컴포넌트
 * (`ItemSerialCode`, 폭이 높이의 약 5배)가 들어가지 않아 글자 칩으로 그린다. 잠긴 개체는 카드가 잠금 타일·이름을 그리고 «N 포인트 필요»가 이어진다.
 * 선택은 카드 테두리(`selected`), 막힘은 흐림+클릭 차단(`muted`), 진행 표시는 `trailing`이다.
 */
export default function ItemCandidateRow({
  candidate,
  rarity,
  imageUrl = null,
  selected = false,
  muted = false,
  trailing,
  onClick,
}: ItemCandidateRowProps) {
  const locked = candidate.locked === true
  const expiring = !locked && isExpiringSoon(candidate.expires_at)
  const points = typeof candidate.unlock_points_required === 'number' && Number.isFinite(candidate.unlock_points_required) ? candidate.unlock_points_required : null
  const shownRarity = candidate.rarity ?? rarity

  const pointsTitle =
    locked && points !== null
      ? points > 0
        ? tPoint(d.lockedItem.card.requiredChip, { n: points.toLocaleString('ko-KR') })
        : d.lockedItem.detail.points.free
      : undefined

  return (
    <BadgeGridCard
      className={muted ? 'w-full opacity-40 pointer-events-none' : 'w-full'}
      name={locked ? undefined : ''}
      imageUrl={locked ? undefined : imageUrl}
      rarity={null}
      locked={locked}
      selected={selected}
      pressed={selected || undefined}
      disabled={muted}
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-1">
        {locked ? (
          pointsTitle ? <span className="text-xs text-foreground text-center break-keep wrap-break-word">{pointsTitle}</span> : null
        ) : (
          // 일련번호 칩도 모든 칩의 기준인 ListRowChip 규격(12px·2px 8px·20px)이다. 색(--background 면)만 다르다(티켓 20261112_0010)
          <ListRowChip className="tracking-wider" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
            {formatSerial(candidate)}
          </ListRowChip>
        )}
        {shownRarity && shownRarity !== 'common' && <RarityBadge rarity={shownRarity} size="md" />}
        {expiring && candidate.expires_at && (
          <ListRowChip style={{ background: 'transparent', color: 'var(--muted)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>
            <LocalDate iso={candidate.expires_at} options={{ month: 'numeric', day: 'numeric' }} suffix={d.inventory.expiringSuffix} />
          </ListRowChip>
        )}
        {trailing}
      </div>
    </BadgeGridCard>
  )
}
