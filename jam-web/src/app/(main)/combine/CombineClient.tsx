'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import TopNav from '@/components/ui/TopNav'
import { useToast } from '@/components/ui/Toast'
import BottomSheet from '@/components/ui/BottomSheet'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { MixerSlot } from '@ds/components/patterns/MixerSlot'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { SearchIcon, PackageIcon } from '@/components/ui/icons'
import RecipeRewardRow from './RecipeRewardRow'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import type { BadgeRow, CombinationRecipeRow, CombineSlotBadgeType, InventoryItemRow } from '@/types/database'

interface InventoryItemWithBadge extends Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> {
  badge: Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>
}

type BadgeDetail = Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity' | 'description'>

/** 슬롯 하나에 딸린 후보(OR) 배지 상세 — 티켓 20260917_1427 */
export interface RecipeSlotWithCandidates {
  id: string
  slot_order: number
  badge_type: CombineSlotBadgeType
  candidates: Pick<BadgeRow, 'id' | 'name' | 'image_url'>[]
}

/** 공개 레시피 + 슬롯 상세 + 보상 배지 상세(티켓 20260917_1655, 슬롯 기반 크래프팅 UI) */
export interface RecipeWithSlots extends CombinationRecipeRow {
  slots: RecipeSlotWithCandidates[]
  /** 레시피 목록 미리보기·결과 캐러셀에 쓰는 보상 배지 상세(name·image_url·rarity·description) */
  rewardBadges: BadgeDetail[]
}

interface Props {
  items: InventoryItemWithBadge[]
  publicRecipes: RecipeWithSlots[]
  /** 유저가 실제로 보유한 조건 슬롯(액티비티·체크인) 후보 배지 id — 서버가 미리 조회해 내려준다 */
  ownedConditionBadgeIds: string[]
}

/** 슬롯을 채운 값 — item 타입은 인벤토리 개체 id, activity/checkin은 배지 id가 refId다 */
interface SlotFill {
  refId: string
  badgeId: string
  name: string
  imageUrl: string | null
}

/**
 * 가방(바텀시트) 목록 한 줄 — 탭한 슬롯의 후보(`slot.candidates`) 전체를 그대로 담는다
 * (티켓 20260917_1655 개정: 유저 보유 배지만 훑던 방식에서 슬롯 후보 전체 노출로 변경).
 * `refId`는 보유한 후보에만 있고(개체 id 또는 조건 배지 id), 미보유 후보는 `refId`가 없다.
 */
interface BagRow {
  key: string
  refId: string | null
  badgeId: string
  name: string
  imageUrl: string | null
  /** active: 탭해서 채울 수 있음 · used: 다른 슬롯에 이미 씀 · needed: 아예 보유하지 않음 */
  state: 'active' | 'used' | 'needed'
}

/** 표시용 이름 — 기존 레시피(마이그레이션 175 이전 데이터)는 name이 NULL일 수 있다(티켓 20260917_1828) */
function recipeDisplayName(recipe: RecipeWithSlots): string {
  return recipe.name ?? d.combine.unnamedRecipe
}

export default function CombineClient({ items, publicRecipes, ownedConditionBadgeIds }: Props) {
  const [search, setSearch] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [fills, setFills] = useState<Record<string, SlotFill>>({})
  const [bagSlotId, setBagSlotId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    badges: RevealBadge[]
    points: number
    message?: string
  } | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const ownedConditionSet = useMemo(() => new Set(ownedConditionBadgeIds), [ownedConditionBadgeIds])
  const itemsByBadgeId = useMemo(() => {
    const map = new Map<string, InventoryItemWithBadge[]>()
    for (const item of items) {
      const list = map.get(item.badge_id) ?? []
      list.push(item)
      map.set(item.badge_id, list)
    }
    return map
  }, [items])

  // 검색 대상 텍스트 — 레시피에 이름이 없어 슬롯 후보·보상 배지 이름을 합쳐서 찾는다
  // (마이그레이션 174: combination_recipes에는 표시용 이름 컬럼이 없다).
  function recipeMatchesSearch(recipe: RecipeWithSlots, query: string): boolean {
    if (!query) return true
    const q = query.trim().toLowerCase()
    if (!q) return true
    const names = [
      ...recipe.rewardBadges.map((b) => b.name),
      ...recipe.slots.flatMap((s) => s.candidates.map((c) => c.name)),
    ]
    return names.some((name) => name.toLowerCase().includes(q))
  }

  const filteredRecipes = useMemo(
    () => publicRecipes.filter((r) => recipeMatchesSearch(r, search)),
    [publicRecipes, search]
  )

  const selectedRecipe = publicRecipes.find((r) => r.id === selectedRecipeId) ?? null
  const canSubmit = !!selectedRecipe && selectedRecipe.slots.every((s) => fills[s.id])

  function selectRecipe(recipeId: string) {
    setSelectedRecipeId(recipeId)
    setFills({})
    setResult(null)
  }

  function closeMixer() {
    setSelectedRecipeId(null)
    setFills({})
  }

  /**
   * 탭한 슬롯의 후보 전체를 가방 목록 한 줄씩으로 만든다 — 보유 여부와 무관하게 후보 전체를
   * 보여줘서, 잠긴 슬롯을 탭해도 "뭘 구해야 하는지"를 확인할 수 있게 한다(티켓 20260917_1655 개정).
   */
  function bagRowsFor(slot: RecipeSlotWithCandidates): BagRow[] {
    const rows: BagRow[] = []
    for (const candidate of slot.candidates) {
      if (slot.badge_type === 'item') {
        const owned = itemsByBadgeId.get(candidate.id) ?? []
        if (owned.length === 0) {
          rows.push({ key: candidate.id, refId: null, badgeId: candidate.id, name: candidate.name, imageUrl: candidate.image_url, state: 'needed' })
          continue
        }
        for (const inv of owned) {
          const usedElsewhere = Object.entries(fills).some(([sId, f]) => sId !== slot.id && f.refId === inv.id)
          rows.push({
            key: inv.id,
            refId: inv.id,
            badgeId: candidate.id,
            name: inv.badge.name,
            imageUrl: inv.badge.image_url,
            state: usedElsewhere ? 'used' : 'active',
          })
        }
      } else {
        if (!ownedConditionSet.has(candidate.id)) {
          rows.push({ key: candidate.id, refId: null, badgeId: candidate.id, name: candidate.name, imageUrl: candidate.image_url, state: 'needed' })
          continue
        }
        const usedElsewhere = Object.entries(fills).some(([sId, f]) => sId !== slot.id && f.refId === candidate.id)
        rows.push({
          key: candidate.id,
          refId: candidate.id,
          badgeId: candidate.id,
          name: candidate.name,
          imageUrl: candidate.image_url,
          state: usedElsewhere ? 'used' : 'active',
        })
      }
    }
    return rows
  }

  function fillSlot(slotId: string, row: BagRow) {
    if (!row.refId) return
    const refId = row.refId
    setFills((prev) => {
      const next = { ...prev }
      // 같은 refId(개체/배지)는 슬롯 하나에만 대응한다 — 다른 슬롯에 이미 쓰였다면 그쪽에서 뺀다.
      for (const key of Object.keys(next)) {
        if (next[key].refId === refId) delete next[key]
      }
      next[slotId] = { refId, badgeId: row.badgeId, name: row.name, imageUrl: row.imageUrl }
      return next
    })
    setBagSlotId(null)
  }

  function removeSlot(slotId: string) {
    setFills((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
  }

  function openBagFor(slot: RecipeSlotWithCandidates) {
    setBagSlotId(slot.id)
  }

  async function handleCombine() {
    if (!selectedRecipe || !canSubmit) return
    const itemIds = selectedRecipe.slots
      .filter((s) => s.badge_type === 'item')
      .map((s) => fills[s.id]?.refId)
      .filter((id): id is string => Boolean(id))

    setLoading(true)
    setResult(null)
    trackEvent('combine_attempt', { item_count: itemIds.length })

    try {
      const res = await fetch('/api/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: selectedRecipe.id, item_ids: itemIds }),
      })
      const data = await res.json()

      const resultBadges = (data.resultBadges ?? []) as { id: string; name: string }[]
      const points = data.pointsAwarded ?? 0
      // 20260910_1408: 레시피 보상은 배지·포인트를 함께 줄 수 있다. 캐러셀에 넘길 상세는
      // 이미 로드해 둔 selectedRecipe.rewardBadges에서 찾는다(API는 id·name·rarity만 준다).
      const revealBadges: RevealBadge[] = resultBadges.map((b) => {
        const detail = selectedRecipe.rewardBadges.find((rb) => rb.id === b.id)
        return {
          id: b.id,
          name: detail?.name ?? b.name,
          description: detail?.description ?? '',
          imageUrl: detail?.image_url,
          rarity: detail?.rarity,
        }
      })

      if (data.success) {
        trackEvent('combine_success', {
          item_count: itemIds.length,
          result_badge_ids: resultBadges.map((b) => b.id).join(','),
        })
      }

      // 성공(배지 없이 포인트만) · 실패 모두 message는 서버가 완성해 내려준다(ADR 0001, 티켓 20260915_2240).
      const message =
        revealBadges.length === 0
          ? data.success
            ? t(d.combine.successPointsOnly, { points })
            : (data.message ?? d.combine.genericFail)
          : undefined

      setResult({ success: !!data.success, badges: revealBadges, points, message })
      // 재료 소각·조합 결과 반영 — 슬롯만 비우고 같은 레시피 화면은 유지한다(오버레이를 닫을 때 처리).
      router.refresh()
    } catch {
      toast(d.combine.genericError, 'error')
    } finally {
      setLoading(false)
    }
  }

  function closeResult() {
    setResult(null)
    // 티켓 요구사항: 오버레이를 닫으면 같은 레시피 화면에 슬롯만 비운 채로 남는다.
    setFills({})
  }

  function renderRecipeRow(recipe: RecipeWithSlots, onPick: (id: string) => void) {
    return (
      <RecipeRewardRow
        key={recipe.id}
        title={recipeDisplayName(recipe)}
        slotCount={recipe.slots.length}
        badges={recipe.rewardBadges}
        points={recipe.reward_points}
        onClick={() => onPick(recipe.id)}
      />
    )
  }

  const bagSlot = selectedRecipe?.slots.find((s) => s.id === bagSlotId) ?? null
  const bagRows = bagSlot ? bagRowsFor(bagSlot) : []

  return (
    <div className="flex flex-col min-h-full text-text">
      {/*
        티켓 20260917_1655: /combine은 인벤토리 하위 화면이라 points와 동일한 뒤로가기형 TopNav를
        쓴다. 믹서 화면에서는 뒤로가기가 라우트를 벗어나지 않고 먼저 레시피 탐색으로
        돌아온다(closeMixer) — 라우트 이탈은 탐색 화면에서 한 번 더 눌러야 일어난다.
      */}
      <TopNav
        title={d.combine.title}
        headerStyle={{ background: 'var(--color-surface)' }}
        onBack={selectedRecipe ? closeMixer : undefined}
      />

      {!selectedRecipe ? (
        <>
          {/* 검색 */}
          <div className="px-[var(--spacing-16)] pt-[var(--spacing-16)] pb-[var(--spacing-16)]">
            <div className="flex items-center gap-[var(--spacing-8)] px-[var(--spacing-16)] py-[var(--spacing-12)] rounded-[var(--radius-pill-buttons)] bg-surface-elevated">
              <SearchIcon className="w-4 h-4 text-text/40 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={d.combine.searchPlaceholder}
                className="flex-1 bg-transparent outline-none text-[length:var(--text-body-sm)] text-text placeholder:text-text/40"
              />
            </div>
          </div>

          {/* 레시피 탐색 목록 */}
          <div className="flex-1 px-[var(--spacing-16)] pb-[var(--spacing-24)]">
            {publicRecipes.length === 0 ? (
              <EmptyState icon={<PackageIcon className="w-8 h-8" />} title={d.combine.noRecipes} />
            ) : filteredRecipes.length === 0 ? (
              <EmptyState icon={<SearchIcon className="w-8 h-8" />} title={d.combine.searchNoResult} />
            ) : (
              <div className="flex flex-col gap-[var(--spacing-8)]">
                {filteredRecipes.map((r) => renderRecipeRow(r, selectRecipe))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/*
            믹서 상단 요약 바(티켓 20260917_1828) — "슬롯 N개" 대신 레시피 이름을, "다른 레시피"
            링크 자리에는 조건별 보상 블록(레시피 탐색 목록 행과 동일 컴포넌트 공유)을 보여준다.
            레시피 전환은 TopNav 뒤로가기가 담당한다(closeMixer → 탐색 화면 → 다시 뒤로가기 시 라우트 이탈).
          */}
          <div className="px-[var(--spacing-16)] pt-[var(--spacing-16)] pb-[var(--spacing-16)]">
            <RecipeRewardRow
              title={recipeDisplayName(selectedRecipe)}
              slotCount={selectedRecipe.slots.length}
              badges={selectedRecipe.rewardBadges}
              points={selectedRecipe.reward_points}
            />
          </div>

          {/* 믹서 슬롯 그리드 */}
          <div className="flex-1 px-[var(--spacing-16)] pb-[var(--spacing-24)]">
            <div className="grid grid-cols-4 gap-[var(--spacing-8)]">
              {selectedRecipe.slots.map((slot) => {
                const fill = fills[slot.id]
                const hasOwnedCandidate =
                  slot.badge_type === 'item'
                    ? slot.candidates.some((c) => (itemsByBadgeId.get(c.id) ?? []).length > 0)
                    : slot.candidates.some((c) => ownedConditionSet.has(c.id))
                const status: 'empty' | 'locked' | 'filled' = fill ? 'filled' : hasOwnedCandidate ? 'empty' : 'locked'

                return (
                  <MixerSlot
                    key={slot.id}
                    status={status}
                    name={fill?.name}
                    imageUrl={fill?.imageUrl}
                    onClick={() => (fill ? undefined : openBagFor(slot))}
                    onRemove={fill ? () => removeSlot(slot.id) : undefined}
                  />
                )
              })}
            </div>
          </div>

          {/* CTA — 화면 전체 폭을 채우지 않는다(티켓 20260917_1828, 요구사항 8) */}
          <div className="px-[var(--spacing-16)] pb-[var(--spacing-24)] flex justify-center">
            <button
              onClick={handleCombine}
              disabled={loading || !canSubmit}
              className="w-full max-w-[220px] py-4 rounded-[var(--radius-pill-buttons)] bg-text text-surface text-[length:var(--text-body)] active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />}
              {loading ? d.combine.combineButtonLoading : d.combine.combineButton}
            </button>
          </div>

          {/*
            가방 — 슬롯 하나를 지정해서 여는 시트. 빈 슬롯뿐 아니라 잠긴 슬롯을 탭해도 열리고,
            그 슬롯의 후보(slot.candidates) 전체를 보여준다(티켓 20260917_1655 개정) —
            슬롯 하나의 후보는 항상 같은 타입이라 타입 탭 구분은 없앴다.
          */}
          <BottomSheet open={!!bagSlot} onClose={() => setBagSlotId(null)} title={d.combine.bagTitle}>
            {/*
              여백은 앱 내 다른 BottomSheet 사용처(예: BadgeUnlockSheet)와 동일하게 맞춘다
              (티켓 20260917_1828, 요구사항 4) — 이 시트만 좌우 패딩이 빠져 있었다.
            */}
            <div className="px-[var(--spacing-16)] pt-[var(--spacing-8)] pb-[var(--spacing-24)]">
              {bagRows.length === 0 ? (
                <EmptyState icon={<PackageIcon className="w-8 h-8" />} title={d.combine.bagEmpty} />
              ) : (
                <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                  {bagRows.map((row) => {
                    const active = row.state === 'active'
                    // 미보유 후보(needed)는 그레이스케일로만 표현한다(인벤토리·컬렉션 화면의
                    // 미획득 처리와 동일한 grayscale+opacity 조합, 티켓 20260917_1828 — "필요"
                    // 텍스트는 제거).
                    const needed = row.state === 'needed'
                    return (
                      <button
                        key={row.key}
                        type="button"
                        disabled={!active}
                        onClick={() => bagSlot && active && fillSlot(bagSlot.id, row)}
                        className={[
                          'flex flex-col items-center gap-[var(--spacing-4)] p-[var(--spacing-8)] rounded-[var(--radius-cards)] bg-surface',
                          active ? 'active:scale-95' : 'opacity-40',
                        ].join(' ')}
                      >
                        <div
                          className={[
                            'w-16 h-16 rounded-[var(--radius-card)] bg-surface-elevated flex items-center justify-center overflow-hidden',
                            needed ? 'grayscale opacity-40' : '',
                          ].join(' ')}
                        >
                          {row.imageUrl ? (
                            <Image src={row.imageUrl} alt={row.name} width={64} height={64} className="object-contain w-full h-full" />
                          ) : (
                            <PackageIcon className="w-6 h-6 text-text/40" />
                          )}
                        </div>
                        <p className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-text text-center line-clamp-2">
                          {row.name}
                        </p>
                        {row.state === 'used' && (
                          <span className="text-[length:var(--text-caption)] text-text/40">{d.combine.bagUsedLabel}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </BottomSheet>
        </>
      )}

      {/* 결과 오버레이 — 성공 시 BadgeRevealCarousel, 실패(또는 배지 없이 포인트만)는 같은 셸에 메시지 */}
      <BadgeRevealOverlay
        open={!!result}
        items={result?.badges ?? []}
        profileHref="/profile"
        onClose={closeResult}
        emptyMessage={result?.message}
      />
    </div>
  )
}
