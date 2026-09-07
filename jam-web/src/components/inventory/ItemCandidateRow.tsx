'use client'

import type { ReactNode } from 'react'
import ListRowCard from '@/components/ui/ListRowCard'
import LocalDate from '@/components/LocalDate'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
import { d } from '@/lib/i18n'
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
 * 값의 근거(20260907_2059의 Chromium 실렌더 측정 + 20260907_2221의 행 폭 계산):
 *   - `ItemSerialCode` 총 폭 = height × 5.31 → height 40이면 212px
 *   - 가장 좁은 기기(320px 뷰포트)의 행 콘텐츠 폭 = 320 − 시트 좌우 패딩 32 − `ListRowCard`
 *     패딩 32 = **256px**. 212px가 여유 있게 들어간다
 *   - 40 아래로 내리지 않는 이유: `ItemSerialCode`의 자간 보간 하한이 fontSize 20(=height 40)
 *     이라 그 아래는 캘리브레이션 범위를 벗어난다. 서비스 실사용 최소값(드랍 시트)도 40이다
 */
export const SELECT_SERIAL_HEIGHT_PX = 40

export interface ItemCandidate {
  id: string
  serial_number: number
  serial_prefix: string | null
  /** 만료 임박 칩("곧 만료")을 선택 시트에 띄우기 위한 값. 만료 없는 개체는 null. */
  expires_at: string | null
}

interface ItemCandidateRowProps {
  candidate: ItemCandidate
  /** 무한레벨형 배지는 등급이 없다(마이그레이션 130) — null/undefined면 등급 칩을 그리지 않는다 */
  rarity: BadgeRarity | null | undefined
  /** 지금 고른 행(요청 진행 중이든 아니든) — 프라이머리 링으로 표시한다 */
  selected?: boolean
  /** 다른 행이 처리되는 동안 이 행을 눌러도 반응하지 않게 한다(시각적으로도 억제) */
  muted?: boolean
  /** 행 우측에 보여줄 보조 표시(예: "처리 중") */
  trailing?: ReactNode
  onClick: () => void
}

/** 개체 선택 시트의 한 행 — 등급칩(위) + 일련번호(아래) + 만료 임박 칩. */
export default function ItemCandidateRow({
  candidate,
  rarity,
  selected = false,
  muted = false,
  trailing,
  onClick,
}: ItemCandidateRowProps) {
  const expiring = isExpiringSoon(candidate.expires_at)

  return (
    <ListRowCard
      onClick={onClick}
      // ListRowCard에는 선택 상태 시각이 없어(active:scale만 있다) 탭 즉시 반응이 사라진다 —
      // 프라이머리 링으로 «지금 이 행»을 표시한다. 배경톤 대신 inset 링을 쓰는 이유: 카드
      // 기본 배경(bg-surface-elevated)과 배경 유틸리티가 경합하지 않아 결과가 규칙 순서에
      // 좌우되지 않는다.
      className={[
        selected ? 'shadow-[inset_0_0_0_2px_var(--color-primary)]' : '',
        muted ? 'opacity-40 pointer-events-none' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      trailing={trailing}
    >
      <div className="flex flex-col items-start gap-[var(--spacing-4)]">
        <RarityBadge rarity={rarity ?? undefined} />
        <ItemSerialCode
          code={formatSerial(candidate)}
          height={SELECT_SERIAL_HEIGHT_PX}
          // 릴(슬롯머신) 연출은 끈다 — 이 화면은 "이미 가진 번호들을 읽고 비교해서 고르는"
          // 자리라, "번호가 지금 확정되는 순간"을 연출하는 릴과 목적이 반대다(20260907_2059).
          animate={false}
        />
        {expiring && candidate.expires_at && (
          <p className="text-[length:var(--text-caption)] font-bold leading-none px-1.5 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border)] text-text/70">
            <LocalDate
              iso={candidate.expires_at}
              options={{ month: 'numeric', day: 'numeric' }}
              suffix={d.inventory.expiringSuffix}
            />
          </p>
        )}
      </div>
    </ListRowCard>
  )
}
