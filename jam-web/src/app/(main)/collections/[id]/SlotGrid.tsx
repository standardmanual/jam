'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import BottomSheet from '@/components/ui/BottomSheet'
import ListRowCard from '@/components/ui/ListRowCard'
import LocalDate from '@/components/LocalDate'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

/** 일련번호 표시 포맷 — 서비스 전역 공통(4자리 prefix + 6자리 zero-pad). */
function formatSerial(item: { serial_prefix: string | null; serial_number: number }): string {
  return `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`
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
const SELECT_SERIAL_HEIGHT_PX = 40

/** 만료 임박(7일 이내) 여부 — 인벤토리 그리드와 같은 기준. */
function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

export interface BadgeSlot {
  badge: {
    id: string
    name: string
    image_url: string | null
    /** 무한레벨형 배지는 등급이 없다(마이그레이션 130). null이면 등급 칩을 그리지 않는다 */
    rarity: string | null
  }
  /**
   * 이 배지로 장착 가능한 **미장착 개체 후보 전체**(obtained_at ASC). 20260907_2059에서
   * 단수 `inventoryItem`을 배열로 바꿨다 — 같은 배지를 여러 개 보유했을 때 어느 개체를
   * 넣을지 사용자가 골라야 하기 때문이다. 비어 있으면 미보유(`???`) 칸이다.
   */
  candidates: {
    id: string
    serial_number: number
    serial_prefix: string | null
    /** 만료 임박 칩("곧 만료")을 선택 시트에 띄우기 위한 값 — 만료가 코앞인 개체를 모르고
     *  장착하는 것을 막는다(20260907_2059). 만료 없는 개체는 null. */
    expires_at: string | null
  }[]
  slot: {
    id: string
    slotted_at: string
    /** 이 칸에 실제로 꽂힌 개체 — 배지 상세 링크의 `?item`으로 넘긴다(20260907_2059) */
    inventory_item_id: string
  } | null
}

interface SlotGridProps {
  itemBookId: string
  badgeSlots: BadgeSlot[]
  readOnly?: boolean
  badgeLinkQuery?: string
  /**
   * 장착 모드 — `/collections/[id]?slot=1`로 진입했을 때 켜진다 (20260824_021).
   *
   * 소식 #11("다 모았어요. 컬렉션에 추가해보세요")은 **완성할 수 있는데 아직 안 넣은**
   * 시점의 소식이라, 단순 이동이 아니라 장착 액션까지 이어져야 제 값을 한다. 슬롯 그리드로
   * 스크롤하고 아직 넣지 않은 칸을 짚어준다.
   */
  slotMode?: boolean
}

export default function SlotGrid({
  itemBookId,
  badgeSlots,
  readOnly = false,
  badgeLinkQuery = '',
  slotMode = false,
}: SlotGridProps) {
  const router = useRouter()
  const [pendingBadgeId, setPendingBadgeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 개체 선택 시트를 띄운 배지 id(후보가 2개 이상일 때만 설정된다) — 20260907_2059 */
  const [selectingBadgeId, setSelectingBadgeId] = useState<string | null>(null)
  /** 시트에서 방금 탭한 개체 id — 요청이 끝나기 전에 카드에 선택 톤을 바로 켠다(20260907_2059) */
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  /**
   * 시트 안에서 보여줄 실패 사유. 그리드 상단의 `error` 배너와 분리한 이유는,
   * 장착 모드에서는 그리드가 이미 `scrollIntoView`된 상태라 시트를 닫고 배너를 띄우면
   * 실패 메시지가 화면 밖에 있을 수 있기 때문이다 — **성공했을 때만 시트를 닫고,
   * 실패는 시트 안에서 알린다**(20260907_2059).
   */
  const [sheetError, setSheetError] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // 장착 모드로 진입하면 슬롯 그리드가 화면에 들어오게 한다(스토리 텍스트가 길어 스크롤이 필요)
  useEffect(() => {
    if (!slotMode || readOnly) return
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [slotMode, readOnly])

  async function getToken(): Promise<string | null> {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  /**
   * 장착 요청. **실패 사유를 문자열로 돌려주고(성공이면 null) 표시 위치는 호출부가 정한다.**
   * 그리드 버튼에서 호출하면 그리드 상단 배너에, 선택 시트에서 호출하면 시트 안에 띄운다
   * (20260907_2059 — 시트를 먼저 닫으면 실패 배너가 화면 밖일 수 있었다).
   */
  async function requestSlot(badgeId: string, inventoryItemId: string): Promise<string | null> {
    setPendingBadgeId(badgeId)
    try {
      const token = await getToken()
      if (!token) return d.itembooks.slotLoginRequired
      const res = await fetch(`/api/itembooks/${itemBookId}/slot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inventory_item_id: inventoryItemId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return data.error ?? d.itembooks.slotFailed
      }
      router.refresh()
      return null
    } catch {
      return d.itembooks.networkError
    } finally {
      setPendingBadgeId(null)
    }
  }

  /** 그리드의 «추가» 버튼 경로 — 실패 사유는 그리드 상단 배너에 띄운다(기존 동작). */
  async function handleSlot(badgeId: string, inventoryItemId: string) {
    setError(null)
    setError(await requestSlot(badgeId, inventoryItemId))
  }

  async function handleUnslot(badgeId: string, slotId: string) {
    setError(null)
    setPendingBadgeId(badgeId)
    try {
      const token = await getToken()
      if (!token) {
        setError(d.itembooks.slotLoginRequired)
        return
      }
      const res = await fetch(`/api/itembooks/${itemBookId}/slot`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot_id: slotId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? d.itembooks.unslotFailed)
        return
      }
      router.refresh()
    } catch {
      setError(d.itembooks.networkError)
    } finally {
      setPendingBadgeId(null)
    }
  }

  /** 후보가 1개면 즉시 장착, 2개 이상이면 일련번호가 보이는 선택 시트를 연다(20260907_2059). */
  function handleSlotButton(badgeSlot: BadgeSlot) {
    if (badgeSlot.candidates.length === 1) {
      handleSlot(badgeSlot.badge.id, badgeSlot.candidates[0].id)
      return
    }
    setError(null)
    setSheetError(null)
    setSelectedCandidateId(null)
    setSelectingBadgeId(badgeSlot.badge.id)
  }

  function closeSelectSheet() {
    setSelectingBadgeId(null)
    setSelectedCandidateId(null)
    setSheetError(null)
  }

  /** 시트에서 개체를 골랐을 때 — 탭 즉시 선택 톤을 켜고, 성공해야만 시트를 닫는다. */
  async function handleSelectCandidate(badgeId: string, inventoryItemId: string) {
    if (pendingBadgeId) return
    setSheetError(null)
    setSelectedCandidateId(inventoryItemId)
    const failure = await requestSlot(badgeId, inventoryItemId)
    if (failure) {
      setSheetError(failure)
      setSelectedCandidateId(null)
      return
    }
    closeSelectSheet()
  }

  const selectingSlot = selectingBadgeId
    ? badgeSlots.find((bs) => bs.badge.id === selectingBadgeId) ?? null
    : null

  return (
    <div ref={gridRef}>
      {error && (
        <div className="mb-3 rounded-[var(--radius-cards)] bg-surface-elevated px-3 py-2 text-xs text-text/70">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
        {badgeSlots.map((badgeSlot) => {
          const { badge, candidates, slot } = badgeSlot
          const isSlotted = slot != null
          const isSlottable = !isSlotted && candidates.length > 0
          const isUndiscovered = !isSlotted && candidates.length === 0
          const pending = pendingBadgeId === badge.id
          // 장착된 칸은 "실제로 꽂힌 개체"를 배지 상세에 넘긴다 — 그러지 않으면 상세가
          // 임의의 대표 개체(최신 획득분)를 골라 다른 일련번호를 보여준다(20260907_2059).
          // (값이 비어 있으면 붙이지 않는다 — 상세는 `?item` 없이도 기존 폴백으로 동작한다)
          const itemQuery = slot?.inventory_item_id
            ? `${badgeLinkQuery ? '&' : '?'}item=${encodeURIComponent(slot.inventory_item_id)}`
            : ''

          return (
            <BadgeGridCard
              key={badge.id}
              name={badge.name}
              imageUrl={badge.image_url}
              rarity={badge.rarity as BadgeRarity | null}
              href={!isUndiscovered ? `/badges/${badge.id}${badgeLinkQuery}${itemQuery}` : undefined}
              earned={isSlotted}
              undiscovered={isUndiscovered}
              highlighted={slotMode && !readOnly && isSlottable}
              className={isUndiscovered ? 'opacity-30' : ''}
            >
              {/* 슬롯 해제 버튼 */}
              {isSlotted && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnslot(badge.id, slot!.id) }}
                  disabled={pending}
                  className="block mx-auto px-3 py-1 text-[length:var(--text-micro)] leading-[var(--leading-micro)] rounded-[var(--radius-pill-buttons)] bg-[color:var(--color-primary)] text-[color:var(--color-text-on-primary)] transition-all disabled:opacity-40"
                >
                  {pending ? '…' : d.itembooks.unslotButton}
                </button>
              )}

              {/* 슬롯 장착 버튼 */}
              {isSlottable && !readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSlotButton(badgeSlot) }}
                  disabled={pending}
                  className="block mx-auto px-3 py-1 text-[length:var(--text-micro)] leading-[var(--leading-micro)] rounded-[var(--radius-pill-buttons)] bg-[color:var(--color-primary)] text-[color:var(--color-text-on-primary)] transition-all disabled:opacity-40"
                >
                  {pending ? '…' : d.itembooks.slotButton}
                </button>
              )}
            </BadgeGridCard>
          )
        })}
      </div>

      {/* 개체 선택 시트 — 같은 배지를 2개 이상 보유했을 때만 열린다(20260907_2059).
          레이어: BottomSheet가 document.body 포털 + z-50(시트·다이얼로그 층)이라
          DESIGN_RENEWAL_SPEC의 기존 층 서열을 그대로 따른다(새 z값 도입 없음).
          하단 고정 액션(footer)이 없으므로 pushBottomOverlay 신고 대상도 아니다. */}
      <BottomSheet
        open={selectingSlot != null}
        onClose={closeSelectSheet}
        // 후보가 전부 같은 배지라 어느 배지인지는 상단에서 한 번만 알린다(20260907_2221).
        // 등급칩은 상단이 아니라 각 행에 둔다 — 같은 칩이 화면에 중복되지 않게 하기 위함.
        title={selectingSlot?.badge.name}
      >
        <div className="px-[var(--spacing-16)] pb-[var(--spacing-16)] flex flex-col gap-[var(--spacing-8)]">
          <p className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-[var(--color-text-secondary)]">
            {selectingSlot ? t(d.itembooks.selectItemBody, { count: String(selectingSlot.candidates.length) }) : ''}
          </p>
          {sheetError && (
            <div className="rounded-[var(--radius-cards)] bg-surface-elevated px-3 py-2 text-xs text-text/70">
              {sheetError}
            </div>
          )}
          {/* 후보 행 — 반복되는 이미지·이름을 걷어내고 «등급칩(위) + 일련번호(아래)»만 쌓는다.
              행 전체가 버튼이므로(ListRowCard는 onClick이 있으면 <button>) 행 안에 별도
              버튼을 두지 않는다(20260907_2221). */}
          {selectingSlot?.candidates.map((candidate) => {
            const expiring = isExpiringSoon(candidate.expires_at)
            const isSelected = selectedCandidateId === candidate.id
            return (
              <ListRowCard
                key={candidate.id}
                onClick={() => {
                  void handleSelectCandidate(selectingSlot.badge.id, candidate.id)
                }}
                // ListRowCard에는 선택 상태 시각이 없어(active:scale만 있다) 탭 즉시 반응이
                // 사라진다 — 요청이 끝날 때까지 프라이머리 링으로 «지금 이 행»을 표시한다.
                // 배경톤 대신 inset 링을 쓰는 이유: 카드 기본 배경(bg-surface-elevated)과
                // 배경 유틸리티가 경합하지 않아 결과가 규칙 순서에 좌우되지 않는다.
                className={isSelected ? 'shadow-[inset_0_0_0_2px_var(--color-primary)]' : ''}
              >
                <div className="flex flex-col items-start gap-[var(--spacing-4)]">
                  <RarityBadge rarity={(selectingSlot.badge.rarity as BadgeRarity | null) ?? undefined} />
                  <ItemSerialCode
                    code={formatSerial(candidate)}
                    height={SELECT_SERIAL_HEIGHT_PX}
                    // 릴(슬롯머신) 연출은 끈다 — 이 화면은 "이미 가진 번호들을 읽고 비교해서
                    // 고르는" 자리라, "번호가 지금 확정되는 순간"을 연출하는 릴과 목적이 반대다
                    // (20260907_2059).
                    animate={false}
                  />
                  {/* 만료가 코앞인 개체를 모르고 장착하는 것을 막는 칩(20260907_2059에서 확보).
                      일련번호 아래에 두어 행 폭을 두고 경합하지 않게 한다. */}
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
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
