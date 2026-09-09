'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import ItemCandidateSheet from '@/components/inventory/ItemCandidateSheet'
import { d, t } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

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
  /**
   * **닫힘 트랜지션 동안에만 쓰는 폴백 스냅샷**(여는 순간의 `BadgeSlot`).
   *
   * `BottomSheet`는 `open=false` 이후에도 닫힘 트랜지션이 끝날 때까지 DOM에 남는데
   * (`BottomSheet.tsx:195`), 그때 `selectingBadgeId`는 이미 null이라 최신값 조회가 실패한다.
   * 그러면 제목과 후보 목록이 한꺼번에 비어 **내용 없는 시트가 쪼그라들며 내려간다.**
   * 이 스냅샷이 그 구간을 메운다.
   *
   * 열려 있는 동안에는 이 값을 쓰지 않는다 — 아래 `sheetView` 주석 참고.
   */
  const [sheetSlot, setSheetSlot] = useState<BadgeSlot | null>(null)
  /** 시트에서 방금 탭한 개체 id — 요청이 끝나기 전에 카드에 선택 톤을 바로 켠다(20260907_2059) */
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  /**
   * 시트 안에서 보여줄 실패 사유. 그리드 상단의 `error` 배너와 분리한 이유는,
   * 장착 모드에서는 그리드가 이미 `scrollIntoView`된 상태라 시트를 닫고 배너를 띄우면
   * 실패 메시지가 화면 밖에 있을 수 있기 때문이다 — **성공했을 때만 시트를 닫고,
   * 실패는 시트 안에서 알린다**(20260907_2059).
   */
  const [sheetError, setSheetError] = useState<string | null>(null)
  /**
   * 시트가 열린 목적을 구분한다 — null이면 "장착"(빈 슬롯 채우기), 슬롯 id가 있으면
   * "교체"(이미 채워진 슬롯의 개체를 바꾸기, 20260910_0015). `selectingBadgeId`만으로는
   * 두 흐름을 구분할 수 없다 — 같은 배지·같은 시트 마크업을 그대로 재사용하되, 개체를
   * 골랐을 때 호출할 API(POST vs PATCH)와 안내 문구만 이 값으로 갈린다.
   */
  const [swapSlotId, setSwapSlotId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  /**
   * 시트가 그리는 대상 — **열려 있으면 최신값, 닫히는 중이면 스냅샷**의 이중 폴백이다.
   *
   * 스냅샷만 쓰면 열려 있는 동안에도 내용이 고정된다. 장착이 409로 실패한 뒤
   * `router.refresh()` 결과가 도착해도 시트는 옛 목록을 계속 그리고, 이미 사라진 후보를
   * 계속 탭할 수 있었다. `selectingBadgeId`가 살아 있는 동안에는 `badgeSlots`에서 매번
   * 다시 찾아 최신 상태를 따라간다.
   *
   * 다시 열 때 이전 배지가 비치지 않는 이유: 여는 클릭이 `selectingBadgeId`와 스냅샷을 같은
   * 핸들러에서 함께 세팅하므로, 시트가 다시 열리는 첫 렌더부터 새 배지다.
   */
  const sheetView =
    (selectingBadgeId ? badgeSlots.find((bs) => bs.badge.id === selectingBadgeId) : null) ?? sheetSlot

  /** 장착 요청이 도는 중 — 시트 안의 행 억제·진행 표시·닫기 차단이 모두 이 값을 본다. */
  const sheetBusy = pendingBadgeId != null

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

  /**
   * 교체 요청 — 기존 슬롯 해제 + 새 개체 장착을 **한 번의 원자적 RPC**(`swap_item_in_book`,
   * 마이그레이션 151)로 처리한다. "해제 API 호출 → 성공하면 장착 API 호출"처럼 순차
   * 호출로 흉내내면, 두 번째 호출이 실패했을 때 슬롯이 빈 채로 남는 정합성 문제가 생긴다
   * (108/109/111이 반복해 온 "원자적 소유권 이전" 원칙, 20260910_0015 티켓 지적).
   */
  async function requestSwap(
    badgeId: string,
    slotId: string,
    inventoryItemId: string
  ): Promise<string | null> {
    setPendingBadgeId(badgeId)
    try {
      const token = await getToken()
      if (!token) return d.itembooks.slotLoginRequired
      const res = await fetch(`/api/itembooks/${itemBookId}/slot`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot_id: slotId, new_inventory_item_id: inventoryItemId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return data.error ?? d.itembooks.swapFailed
      }
      router.refresh()
      return null
    } catch {
      return d.itembooks.networkError
    } finally {
      setPendingBadgeId(null)
    }
  }

  /**
   * 해제 요청 — 실패 사유를 문자열로 돌려주고(성공이면 null) 표시 위치는 호출부가 정한다.
   * `requestSlot`/`requestSwap`과 같은 패턴이다. 그리드의 «해제» 버튼(그리드 배너)과
   * 교체 시트 안의 «해제하기» 보조 액션(시트 배너, 20260910_0015 후속)이 함께 쓴다.
   */
  async function requestUnslot(badgeId: string, slotId: string): Promise<string | null> {
    setPendingBadgeId(badgeId)
    try {
      const token = await getToken()
      if (!token) return d.itembooks.slotLoginRequired
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
        return data.error ?? d.itembooks.unslotFailed
      }
      router.refresh()
      return null
    } catch {
      return d.itembooks.networkError
    } finally {
      setPendingBadgeId(null)
    }
  }

  /** 그리드의 «해제» 버튼 경로 — 실패 사유는 그리드 상단 배너에 띄운다(기존 동작). */
  async function handleUnslot(badgeId: string, slotId: string) {
    setError(null)
    setError(await requestUnslot(badgeId, slotId))
  }

  /**
   * 교체 시트 안의 «해제하기» 경로 — 인터페이스 리뷰 지적(교체가 해제 자리를 완전히
   * 대체해 순수 해제 경로가 사라지는 회귀) 반영. 시트를 연 대상(`sheetView`)을 그대로
   * 쓴다 — 그리드 버튼과 달리 badgeId·slotId를 인자로 받지 않는다.
   */
  async function handleSheetUnslot() {
    if (!sheetView?.slot || pendingBadgeId) return
    setSheetError(null)
    const failure = await requestUnslot(sheetView.badge.id, sheetView.slot.id)
    if (failure) {
      setSheetError(failure)
      return
    }
    closeSelectSheet()
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
    setSheetSlot(badgeSlot)
    setSwapSlotId(null)
    setSelectingBadgeId(badgeSlot.badge.id)
  }

  /**
   * «교체» 버튼 경로 — 후보가 1개뿐이어도 항상 시트를 연다(장착과 다른 지점, 20260910_0015).
   * 이미 장착된 것이 있는 상태에서 여는 흐름이라, "지금 장착된 것과 다른 개체로 바꾼다"는
   * 걸 사용자가 확인하고 골라야 한다 — 후보가 1개면 자동으로 밀어넣는 장착 버튼의 지름길을
   * 그대로 적용하면, 사용자가 무엇으로 바뀌는지 보지도 못한 채 교체가 일어난다.
   */
  function handleSwapButton(badgeSlot: BadgeSlot) {
    if (!badgeSlot.slot) return
    setError(null)
    setSheetError(null)
    setSelectedCandidateId(null)
    setSheetSlot(badgeSlot)
    setSwapSlotId(badgeSlot.slot.id)
    setSelectingBadgeId(badgeSlot.badge.id)
  }

  /**
   * 시트를 닫는다. **여는 시점에 세팅하는 값(대상 배지·선택 톤·시트 에러)은 여기서 건드리지
   * 않는다** — `BottomSheet`는 닫힘 트랜지션 동안 DOM에 남으므로, 여기서 지우면 내려가는
   * 시트에서 그 값들만 툭 사라진다. 초기화는 `handleSlotButton`(=여는 순간)이 이미 하고 있다.
   */
  function closeSelectSheet() {
    setSelectingBadgeId(null)
  }

  /**
   * 사용자가 시트를 닫으려 할 때(백드롭 탭·핸들 드래그). **요청이 도는 동안에는 무시한다.**
   * 닫힌 뒤 실패가 도착하면 `sheetError`는 이미 사라진 시트에 세팅되고 다음에 열 때 지워져,
   * **장착이 실패했는데 사용자가 아무것도 보지 못한다.** 그리드 상단 배너로 대신 알리는 방식은
   * 20260907_2059가 배제했다 — 장착 모드에서는 그리드가 화면 밖일 수 있다.
   * 왜 안 닫히는지는 행에 함께 뜨는 진행 표시("처리 중")가 설명한다.
   */
  function handleSheetClose() {
    if (sheetBusy) return
    closeSelectSheet()
  }

  /** 시트에서 개체를 골랐을 때 — 탭 즉시 선택 톤을 켜고, 성공해야만 시트를 닫는다. */
  async function handleSelectCandidate(badgeId: string, inventoryItemId: string) {
    // `.t-panel-slide`가 data-open="false"에서 pointer-events를 끊으므로 닫힘 트랜지션 동안
    // 행은 눌리지 않는다. 남는 창은 `BottomSheet`가 `setShown(false)`를 rAF로 미루는 **1프레임**
    // 뿐이지만, 그 사이의 탭도 이미 닫힌 시트의 탭이므로 무시한다.
    if (!selectingBadgeId || pendingBadgeId) return
    setSheetError(null)
    setSelectedCandidateId(inventoryItemId)
    const failure = swapSlotId
      ? await requestSwap(badgeId, swapSlotId, inventoryItemId)
      : await requestSlot(badgeId, inventoryItemId)
    if (failure) {
      setSheetError(failure)
      setSelectedCandidateId(null)
      return
    }
    closeSelectSheet()
  }

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
              {/* 슬롯 해제/교체 버튼 — 같은 배지의 미장착 후보가 있으면 "교체"가 이 자리를
                  대신한다(20260910_0015). 교체는 장착 쪽에 가까운 양성 액션이라 장착과
                  같은 톤(--color-primary)을 쓴다 — 완료 기록의 판단 근거 참고. 후보가 없어
                  단순 해제만 가능할 때는 20260910_0025가 정한 대로 그레이를 유지한다
                  (장착=양성/primary, 해제=취소성/그레이 구분). */}
              {isSlotted && !readOnly && (
                candidates.length > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSwapButton(badgeSlot) }}
                    disabled={pending}
                    className="block mx-auto px-3 py-1 text-[length:var(--text-micro)] leading-[var(--leading-micro)] rounded-[var(--radius-pill-buttons)] bg-[color:var(--color-primary)] text-[color:var(--color-text-on-primary)] transition-all disabled:opacity-40"
                  >
                    {pending ? '…' : d.itembooks.swapButton}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnslot(badge.id, slot!.id) }}
                    disabled={pending}
                    className="block mx-auto px-3 py-1 text-[length:var(--text-micro)] leading-[var(--leading-micro)] rounded-[var(--radius-pill-buttons)] bg-[color:var(--color-base-grey-600)] text-[color:var(--color-text-on-primary)] transition-all disabled:opacity-40"
                  >
                    {pending ? '…' : d.itembooks.unslotButton}
                  </button>
                )
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
          하단 고정 액션(footer)이 없으므로 pushBottomOverlay 신고 대상도 아니다.
          마크업은 드랍·픽업 개체 선택 시트와 공유하는 ItemCandidateSheet로 옮겼다
          (20260908, 세 번째 사용처 시점에 공용 컴포넌트로 추출 — 사용자 지시). 이 화면만
          요청 진행 중 상태(선택 표시·비활성화·진행 표시·에러 배너)가 있어 관련 prop을 넘긴다. */}
      <ItemCandidateSheet
        open={selectingBadgeId != null}
        onClose={handleSheetClose}
        badgeName={sheetView?.badge.name}
        rarity={sheetView?.badge.rarity as BadgeRarity | null}
        bodyText={
          sheetView
            ? swapSlotId
              ? d.itembooks.swapItemBody
              : t(d.itembooks.selectItemBody, { count: String(sheetView.candidates.length) })
            : ''
        }
        candidates={sheetView?.candidates ?? []}
        error={sheetError}
        busy={sheetBusy}
        isSelected={(candidate) => selectedCandidateId === candidate.id}
        // 요청 중 «고르지 않은» 행은 눌러도 아무 일이 없다(핸들러 가드). 그런데 행은 여전히
        // active:scale·cursor-pointer가 살아 있어 «눌린 반응은 나오는데 아무 일도 안 하는»
        // 죽은 탭이 된다 — 시각적으로도 함께 억제한다.
        isMuted={(candidate) => sheetBusy && selectedCandidateId !== candidate.id}
        // 진행 표시 — 왜 지금 다른 행이 눌리지 않고 시트도 닫히지 않는지를 설명한다.
        renderTrailing={(candidate) =>
          selectedCandidateId === candidate.id && sheetBusy ? (
            <span className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-[var(--color-text-secondary)]">
              {d.itembooks.processing}
            </span>
          ) : undefined
        }
        onSelect={(candidate) => {
          if (!sheetView) return
          void handleSelectCandidate(sheetView.badge.id, candidate.id)
        }}
        // 교체 시트에서만 "해제하기" 보조 액션을 보여준다(장착 시트는 아직 채워진 슬롯이
        // 없으므로 해제할 대상 자체가 없다). 인터페이스 리뷰 지적(교체가 해제 자리를 완전히
        // 대체해 순수 해제 경로가 사라지는 회귀) 반영 — 20260910_0015 후속.
        secondaryAction={
          swapSlotId
            ? { label: d.itembooks.swapSheetUnslotButton, onClick: () => void handleSheetUnslot(), disabled: sheetBusy }
            : undefined
        }
      />
    </div>
  )
}
