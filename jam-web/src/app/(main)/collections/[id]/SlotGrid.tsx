'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import BottomSheet from '@/components/ui/BottomSheet'
import InventoryGrid, { type InventoryGridItem } from '@/components/inventory/InventoryGrid'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

/** 일련번호 표시 포맷 — 서비스 전역 공통(4자리 prefix + 6자리 zero-pad). */
function formatSerial(item: { serial_prefix: string | null; serial_number: number }): string {
  return `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`
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
  const selectingItems: InventoryGridItem[] = selectingSlot
    ? selectingSlot.candidates.map((candidate) => ({
        id: candidate.id,
        badgeName: selectingSlot.badge.name,
        badgeImageUrl: selectingSlot.badge.image_url,
        badgeRarity: selectingSlot.badge.rarity,
        serial: formatSerial(candidate),
        // 만료 임박 칩("곧 만료")을 그리려면 값이 필요하다 — 없으면 InventoryGrid가 칩을
        // 그리지 않는다(20260907_2059).
        expiresAt: candidate.expires_at,
      }))
    : []

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
        title={d.itembooks.selectItemTitle}
      >
        <div className="px-[var(--spacing-16)] pb-[var(--spacing-16)] flex flex-col gap-[var(--spacing-12)]">
          <p className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-[var(--color-text-secondary)]">
            {selectingSlot ? t(d.itembooks.selectItemBody, { count: String(selectingSlot.candidates.length) }) : ''}
          </p>
          {sheetError && (
            <div className="rounded-[var(--radius-cards)] bg-surface-elevated px-3 py-2 text-xs text-text/70">
              {sheetError}
            </div>
          )}
          <InventoryGrid
            items={selectingItems}
            mode="select"
            // 일련번호를 읽고 비교해서 고르는 화면이라 1열이다 — 3열 카드 폭(360px 뷰포트에서
            // 클리핑 경계 100px)에는 판독 가능한 크기의 ItemSerialCode가 들어가지 않는다.
            columns={1}
            selectedItemId={selectedCandidateId}
            disabled={pendingBadgeId != null}
            onSelect={(item) => {
              if (!selectingSlot) return
              void handleSelectCandidate(selectingSlot.badge.id, item.id)
            }}
          />
        </div>
      </BottomSheet>
    </div>
  )
}
