'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { BadgeRow, CombinationRecipeRow, CombinationRecipeSlotRow, CombineSlotBadgeType } from '@/types/database'
import MultiBadgeSearchSelect, { badgeLabel, type SelectedBadge } from '@/components/admin/MultiBadgeSearchSelect'
import { Input } from '@/components/admin/ui/input'
import { MAX_SLOTS, MIN_ITEM_SLOTS, MIN_SLOTS } from '@/lib/combine/recipe-payload'

type BadgeBrief = Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>

interface Props {
  /** 수정 대상 — 없으면 생성 모드 */
  recipe?: CombinationRecipeRow
  /** 수정 대상의 기존 슬롯 — 생성 모드에서는 전달하지 않는다 */
  slots?: CombinationRecipeSlotRow[]
  badges: BadgeBrief[]
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string }[]
}

/** 슬롯 하나 — 첫 후보 배지를 고르는 순간 badgeType이 고정되고, 이후 다른 타입은 검색에서 제외된다 */
interface SlotState {
  badgeType: CombineSlotBadgeType | null
  badges: SelectedBadge[]
}

const EMPTY_SLOT: SlotState = { badgeType: null, badges: [] }

const SLOT_TYPE_LABEL: Record<CombineSlotBadgeType, string> = {
  item: '아이템',
  activity: '액티비티',
  checkin: '체크인',
}

function slotsFromRecipe(slots: CombinationRecipeSlotRow[], badgeMap: Map<string, BadgeBrief>): SlotState[] {
  return [...slots]
    .sort((a, b) => a.slot_order - b.slot_order)
    .map((s) => ({
      badgeType: s.badge_type,
      badges: s.allowed_badge_ids.map((id) => {
        const badge = badgeMap.get(id)
        return { id, label: badge ? badgeLabel(badge) : id, type: badge?.type ?? s.badge_type }
      }),
    }))
}

function rewardBadgesFromRecipe(r: CombinationRecipeRow, badgeMap: Map<string, BadgeBrief>): SelectedBadge[] {
  return (r.reward_badge_ids ?? []).map((id) => {
    const badge = badgeMap.get(id)
    return { id, label: badge ? badgeLabel(badge) : id }
  })
}

/**
 * 레시피 생성/수정 폼 — 슬롯 기반 OR 매칭 재설계(티켓 20260917_1427).
 *
 * 슬롯 하나는 "이 자리에 넣을 수 있는 배지 후보 목록(OR)"이다. 최초 후보 배지를 고르는
 * 순간 그 배지의 타입으로 슬롯 타입이 고정되고, 이후 `MultiBadgeSearchSelect`의 타입
 * 필터가 그 타입으로 좁혀져 다른 타입 배지는 검색 결과에 나타나지 않는다(카드 하단
 * 안내 문구로도 알린다). 소각 여부는 타입으로 고정 결정된다(아이템=소각,
 * 액티비티·체크인=비소각) — 별도 토글 없음.
 */
export default function RecipeForm({ recipe, slots: initialSlotsRaw, badges, tribes, itemBooks }: Props) {
  const editingId = recipe?.id ?? null
  const badgeMap = useMemo(() => new Map(badges.map((b) => [b.id, b])), [badges])

  const [name, setName] = useState(recipe?.name ?? '')
  const [slots, setSlots] = useState<SlotState[]>(
    initialSlotsRaw && initialSlotsRaw.length > 0
      ? slotsFromRecipe(initialSlotsRaw, badgeMap)
      : [EMPTY_SLOT, EMPTY_SLOT]
  )
  const [rewardPoints, setRewardPoints] = useState(recipe ? String(recipe.reward_points ?? 0) : '0')
  const [rewardBadges, setRewardBadges] = useState<SelectedBadge[]>(
    recipe ? rewardBadgesFromRecipe(recipe, badgeMap) : []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const itemSlotCount = slots.filter((s) => s.badgeType === 'item').length
  const conditionSlotCount = slots.length - itemSlotCount

  async function handleSave() {
    setError(null)

    if (!name.trim()) {
      setError('레시피 이름을 입력해 주세요.')
      return
    }

    const emptySlotIdx = slots.findIndex((s) => s.badges.length === 0)
    if (emptySlotIdx !== -1) {
      setError(`슬롯마다 후보 배지를 1개 이상 넣어 주세요 (슬롯 ${emptySlotIdx + 1}이 비어 있어요).`)
      return
    }
    if (slots.length < MIN_SLOTS) {
      setError(`슬롯을 ${MIN_SLOTS}개 이상 만들어 주세요.`)
      return
    }
    if (slots.length > MAX_SLOTS) {
      setError(`슬롯은 최대 ${MAX_SLOTS}개까지 만들 수 있어요.`)
      return
    }
    if (itemSlotCount < MIN_ITEM_SLOTS) {
      setError(
        `아이템 타입 슬롯을 ${MIN_ITEM_SLOTS}개 이상 만들어 주세요. 소각되는 재료가 없는 레시피는 만들 수 없어요.`
      )
      return
    }
    const points = Number(rewardPoints || '0')
    if (!Number.isInteger(points) || points < 0) {
      setError('보상 포인트는 0 이상의 정수여야 해요.')
      return
    }
    if (points === 0 && rewardBadges.length === 0) {
      setError('보상을 하나 이상 지정해 주세요. 포인트나 배지 중 최소 하나가 필요해요.')
      return
    }

    setSaving(true)
    const payload = {
      name: name.trim(),
      slots: slots.map((s) => ({
        badge_type: s.badgeType,
        allowed_badge_ids: s.badges.map((b) => b.id),
      })),
      reward_points: points,
      reward_badge_ids: rewardBadges.map((b) => b.id),
    }
    try {
      const res = await fetch(
        editingId ? `/api/admin/recipes/${editingId}` : '/api/admin/recipes',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? '레시피가 저장되지 않았어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      router.push('/admin/recipes')
      router.refresh()
    } catch {
      setError('네트워크 오류로 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  function setSlotBadges(idx: number, next: SelectedBadge[]) {
    setSlots((prev) => {
      const copy = [...prev]
      const current = copy[idx]
      // 최초 후보가 생기는 순간 그 배지의 타입으로 슬롯 타입을 고정한다.
      const badgeType = current.badgeType ?? (next[0]?.type as CombineSlotBadgeType | undefined) ?? null
      copy[idx] = { badgeType, badges: next }
      return copy
    })
  }

  function addSlot() {
    setSlots((prev) => (prev.length >= MAX_SLOTS ? prev : [...prev, EMPTY_SLOT]))
  }

  function removeSlot(idx: number) {
    setSlots((prev) => (prev.length <= MIN_SLOTS ? prev : prev.filter((_, i) => i !== idx)))
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <h2 className="font-bold">{editingId ? '레시피 수정' : '새 레시피'}</h2>

      {/* 표시용 이름(티켓 20260917_1828) — 믹서 화면 상단 요약·레시피 탐색 목록에 노출한다 */}
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">
          레시피 이름 — 유저 화면(믹서 상단 요약·레시피 탐색 목록)에 노출돼요
        </label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 체크섬 조각 세트"
          className="max-w-md"
        />
      </div>

      {/* 슬롯 — 슬롯 하나에 후보 배지(OR)를 여러 개 담는다. 첫 후보로 타입이 고정된다 */}
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">
          슬롯 — 슬롯마다 후보 배지를 여러 개 지정할 수 있고, 유저는 그중 하나만 채우면 돼요.
          아이템 배지는 <b>소모</b>되고, 액티비티·체크인 배지는 <b>보유 조건</b>으로만 검증돼요
          (슬롯 {MIN_SLOTS}~{MAX_SLOTS}개, 아이템 타입 슬롯 {MIN_ITEM_SLOTS}개 이상 필요)
        </label>
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={i} className="border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">슬롯 {i + 1}</span>
                  <span
                    className={[
                      'text-xs px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap',
                      slot.badgeType === 'item'
                        ? 'bg-amber-50 text-amber-700'
                        : slot.badgeType
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-neutral-100 text-neutral-400',
                    ].join(' ')}
                  >
                    {slot.badgeType ? SLOT_TYPE_LABEL[slot.badgeType] : '타입 미정'}
                  </span>
                </div>
                {slots.length > MIN_SLOTS && (
                  <button
                    onClick={() => removeSlot(i)}
                    className="text-muted-foreground hover:text-red-600 text-xs px-2"
                  >
                    슬롯 삭제
                  </button>
                )}
              </div>
              <MultiBadgeSearchSelect
                key={`${editingId ?? 'new'}-slot-${i}`}
                selected={slot.badges}
                onChange={(next) => setSlotBadges(i, next)}
                tribes={tribes}
                itemBooks={itemBooks}
                badgeType={slot.badgeType}
                placeholder={`슬롯 ${i + 1} 후보 배지 검색...`}
              />
              {slot.badgeType && (
                <p className="text-xs text-muted-foreground">
                  이 슬롯은 {SLOT_TYPE_LABEL[slot.badgeType]} 배지만 넣을 수 있어요. 다른 타입을 쓰려면 슬롯을
                  새로 추가해 주세요.
                </p>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addSlot}
          disabled={slots.length >= MAX_SLOTS}
          className="text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-1.5 mt-3 disabled:opacity-40"
        >
          + 슬롯 추가
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          슬롯 {slots.length}개(아이템 {itemSlotCount} · 조건 {conditionSlotCount})
        </p>
      </div>

      {/* 보상 — 확정 지급 (성공률 개념 없음) */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-bold">보상 (모든 슬롯이 충족되면 100% 지급)</p>
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">보상 포인트 (0이면 미지급)</label>
          <Input
            type="number"
            min="0"
            step="1"
            value={rewardPoints}
            onChange={(e) => setRewardPoints(e.target.value)}
            className="max-w-[12rem]"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">
            보상 배지 — 트라이브·컬렉션·등급으로 후보를 좁혀 찾고, 고른 배지는 무작위 없이 전부
            지급돼요
          </label>
          <MultiBadgeSearchSelect
            key={editingId ?? 'new'}
            selected={rewardBadges}
            onChange={setRewardBadges}
            tribes={tribes}
            itemBooks={itemBooks}
            badgeType="item"
            placeholder="보상 배지 검색..."
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중...' : editingId ? '수정 저장' : '저장'}
        </button>
        <Link href="/admin/recipes" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          취소
        </Link>
      </div>
    </div>
  )
}
