'use client'

import type { ReactNode } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import ItemCandidateRow, { type ItemCandidate } from '@/components/inventory/ItemCandidateRow'
import type { BadgeRarity } from '@/types/database'

// 20260908: 장착(20260907_2221)·드랍(20260908_0040/0217)·픽업(20260908_0223) 개체 선택
// 시트가 각자 파일에 거의 동일한 마크업(BottomSheet + 안내문 + ItemCandidateRow 목록)을
// 들고 있었다 — 세 번째 사용처가 생긴 시점(20260908_0223 개선 리뷰가 이미 지적)이라 여기로
// 뽑는다. 시각 사양(제목 크기·여백·본문 좌측 정렬)은 사용자 지시로 한 번에 조정한다.

export interface ItemCandidateSheetProps {
  open: boolean
  onClose: () => void
  /** 후보가 전부 같은 배지이므로 상단에 한 번만 표시한다. 등급칩은 상단이 아니라 각 행에 둔다. */
  badgeName: string | undefined
  /** 후보 전체에 공통인 등급 — 정규화(예: 미지 값→'common')는 호출부 책임이다. */
  rarity: BadgeRarity | null | undefined
  bodyText: string
  candidates: ItemCandidate[]
  onSelect: (candidate: ItemCandidate) => void
  /** 안내문과 후보 목록 사이에 보여줄 에러 배너 — 장착 시트만 쓴다(API 호출 실패, 20260907_2221). */
  error?: ReactNode
  /**
   * 요청 진행 중임을 후보 목록에 알린다(`aria-busy`) — 장착 시트만 쓴다. 드랍·픽업 선택은
   * 이 시트 자체가 API를 호출하지 않으므로 필요 없다.
   */
  busy?: boolean
  /** 행별 선택 표시 — 장착 시트가 요청 진행 중 "지금 이 행"을 프라이머리 링으로 보여줄 때만 쓴다. */
  isSelected?: (candidate: ItemCandidate) => boolean
  /** 행별 비활성 표시 — 장착 시트가 요청 진행 중 다른 행을 억제할 때만 쓴다. */
  isMuted?: (candidate: ItemCandidate) => boolean
  /** 행별 보조 표시(예: "처리 중") — 장착 시트 전용. */
  renderTrailing?: (candidate: ItemCandidate) => ReactNode
}

/**
 * 개체 선택 시트 — "같은 배지를 여러 개 보유했을 때 등급칩+일련번호로 구분해 고르는" 화면
 * 3곳(장착·드랍·픽업)이 공유한다. 헤더(제목 크기·상하 여백)와 본문 좌측 정렬을 이 컴포넌트
 * 한 곳에서 고정해, 이후 시트가 늘어나도 시각 사양이 벌어지지 않게 한다.
 */
export default function ItemCandidateSheet({
  open,
  onClose,
  badgeName,
  rarity,
  bodyText,
  candidates,
  onSelect,
  error,
  busy = false,
  isSelected,
  isMuted,
  renderTrailing,
}: ItemCandidateSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={badgeName}
      // 배지 이름이 이 시트의 유일한 정체 정보라 존재감을 키운다(--text-h4, 사용자 지시).
      // 헤더 좌우 패딩(24)을 본문 컨테이너의 좌우 패딩과 맞춰 제목·본문 시작 위치를 맞춘다.
      // 상단 여백(pt-8)은 핸들과 제목 사이 간격을 확보하고, 하단 여백(pb-8, 기본 16보다 좁힘)
      // 은 제목과 본문 사이 간격을 줄인다.
      headerClassName="px-[var(--spacing-24)] pt-[var(--spacing-8)] pb-[var(--spacing-8)] shrink-0"
      titleClassName="text-[length:var(--text-h4)] leading-[var(--leading-h4)] font-[number:var(--weight-h4)] tracking-[var(--tracking-h4)]"
    >
      <div className="px-[var(--spacing-24)] pb-[var(--spacing-16)] flex flex-col gap-[var(--spacing-8)]">
        <p className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-[var(--color-text-secondary)]">
          {bodyText}
        </p>
        {error && (
          <div className="rounded-[var(--radius-cards)] bg-surface-elevated px-3 py-2 text-xs text-text/70">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-[var(--spacing-8)]" aria-busy={busy}>
          {candidates.map((candidate) => (
            <ItemCandidateRow
              key={candidate.id}
              candidate={candidate}
              rarity={rarity}
              selected={isSelected?.(candidate) ?? false}
              muted={isMuted?.(candidate) ?? false}
              trailing={renderTrailing?.(candidate)}
              onClick={() => onSelect(candidate)}
            />
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
