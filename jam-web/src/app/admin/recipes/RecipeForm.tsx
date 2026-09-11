'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { BadgeRow, CombinationRecipeRow } from '@/types/database'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import MultiBadgeSearchSelect, { badgeLabel, type SelectedBadge } from '@/components/admin/MultiBadgeSearchSelect'
import { Input } from '@/components/admin/ui/input'
import { MAX_INGREDIENTS, MIN_INGREDIENTS } from '@/lib/combine/recipe-payload'

type BadgeBrief = Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type'>

interface Props {
  /** 수정 대상 — 없으면 생성 모드 */
  recipe?: CombinationRecipeRow
  badges: BadgeBrief[]
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string }[]
}

/** 재료 슬롯 하나 — 배지 타입 무관으로 고르고, 타입에 따라 소모/보유 조건으로 자동 분류된다 */
interface IngredientSlot {
  id: string
  label: string
  /** 빈 슬롯이면 null */
  type: string | null
}

const EMPTY_SLOT: IngredientSlot = { id: '', label: '', type: null }

function slotsFromRecipe(r: CombinationRecipeRow, badgeMap: Map<string, BadgeBrief>): IngredientSlot[] {
  const toSlot = (id: string): IngredientSlot => {
    const badge = badgeMap.get(id)
    return { id, label: badge ? badgeLabel(badge) : id, type: badge?.type ?? null }
  }
  return [...r.ingredient_badge_ids.map(toSlot), ...(r.required_badge_ids ?? []).map(toSlot)]
}

function rewardBadgesFromRecipe(r: CombinationRecipeRow, badgeMap: Map<string, BadgeBrief>): SelectedBadge[] {
  return (r.reward_badge_ids ?? []).map((id) => {
    const badge = badgeMap.get(id)
    return { id, label: badge ? badgeLabel(badge) : id }
  })
}

/**
 * 레시피 생성/수정 폼(티켓 20260911_2035) — 목록(`RecipeList.tsx`) 내부 토글이 아니라
 * `/admin/recipes/new`, `/admin/recipes/[id]` 별도 페이지로 이동해 연다. 폼 자체(입력
 * 필드·검증 로직)는 기존 `RecipeList.tsx`에서 그대로 옮겨왔다.
 */
export default function RecipeForm({ recipe, badges, tribes, itemBooks }: Props) {
  const editingId = recipe?.id ?? null
  const badgeMap = useMemo(() => new Map(badges.map((b) => [b.id, b])), [badges])

  const [slots, setSlots] = useState<IngredientSlot[]>(
    recipe ? slotsFromRecipe(recipe, badgeMap) : [EMPTY_SLOT, EMPTY_SLOT]
  )
  const [rewardPoints, setRewardPoints] = useState(recipe ? String(recipe.reward_points ?? 0) : '0')
  const [rewardBadges, setRewardBadges] = useState<SelectedBadge[]>(
    recipe ? rewardBadgesFromRecipe(recipe, badgeMap) : []
  )
  const [hintText, setHintText] = useState(recipe?.hint_text ?? '')
  const [isPublic, setIsPublic] = useState(recipe?.is_public ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  /** 소모(아이템 배지) 슬롯 수 — 최소 2개여야 저장 가능 */
  const itemSlotCount = slots.filter((s) => s.type === 'item').length

  async function handleSave() {
    setError(null)
    const badgeIds = slots.map((s) => s.id).filter(Boolean)
    if (new Set(badgeIds).size !== badgeIds.length) {
      setError('같은 배지를 두 슬롯에 넣을 수 없어요. 중복된 재료를 지워 주세요.')
      return
    }
    if (itemSlotCount < MIN_INGREDIENTS) {
      setError(
        `소모될 아이템 배지를 ${MIN_INGREDIENTS}개 이상 선택해 주세요. 액티비티·체크인 배지는 보유 조건으로만 쓰여요.`
      )
      return
    }
    if (itemSlotCount > MAX_INGREDIENTS) {
      setError(`소모될 아이템 배지는 최대 ${MAX_INGREDIENTS}개까지 지정할 수 있어요.`)
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
      badge_ids: badgeIds,
      reward_points: points,
      reward_badge_ids: rewardBadges.map((b) => b.id),
      hint_text: hintText,
      is_public: isPublic,
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

  function setSlot(idx: number, id: string, badge?: { name: string; type: string; rarity: string }) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = id && badge ? { id, label: badgeLabel(badge), type: badge.type } : EMPTY_SLOT
      return next
    })
  }

  function addSlot() {
    setSlots((prev) => (prev.length >= MAX_INGREDIENTS * 2 ? prev : [...prev, EMPTY_SLOT]))
  }

  function removeSlot(idx: number) {
    setSlots((prev) => (prev.length <= MIN_INGREDIENTS ? prev : prev.filter((_, i) => i !== idx)))
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
      <h2 className="font-bold">{editingId ? '레시피 수정' : '새 레시피'}</h2>

      {/* 재료 선택 — 배지 타입 무관. 저장 시 시스템이 소모/보유 조건으로 분류한다 */}
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">
          재료 배지 — 아이템·액티비티·체크인 배지를 모두 고를 수 있어요. 아이템 배지는{' '}
          <b>소모</b>되고, 액티비티·체크인 배지는 <b>보유 조건</b>으로만 검증돼요 (소모될 아이템
          배지 {MIN_INGREDIENTS}~{MAX_INGREDIENTS}개 필요)
        </label>
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <BadgeSearchSelect
                key={`${editingId ?? 'new'}-${i}`}
                value={slot.id}
                initialLabel={slot.label}
                placeholder={`재료 ${i + 1} 검색...`}
                onChange={(id, badge) => setSlot(i, id, badge)}
              />
            </div>
            <span
              className={[
                'text-xs px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap',
                slot.type === 'item'
                  ? 'bg-amber-50 text-amber-700'
                  : slot.type
                    ? 'bg-sky-50 text-sky-700'
                    : 'bg-neutral-100 text-neutral-400',
              ].join(' ')}
            >
              {slot.type === 'item' ? '소모' : slot.type ? '보유 조건' : '미선택'}
            </span>
            {slots.length > MIN_INGREDIENTS && (
              <button
                onClick={() => removeSlot(i)}
                className="text-muted-foreground hover:text-red-600 text-xs px-2 shrink-0"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addSlot}
          className="text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-1.5 mt-1"
        >
          + 재료 슬롯 추가
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          소모 {itemSlotCount}개 · 보유 조건 {slots.filter((s) => s.type && s.type !== 'item').length}개
        </p>
      </div>

      {/* 보상 — 확정 지급 (성공률 개념 없음) */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-bold">보상 (재료가 정확히 일치하면 100% 지급)</p>
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
            placeholder="보상 배지 검색..."
          />
        </div>
      </div>

      {/* 힌트 */}
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">힌트 문구 (비공개 레시피용)</label>
        <Input
          type="text"
          value={hintText}
          onChange={(e) => setHintText(e.target.value)}
          placeholder="예: 겨울 등반에 필요한 것들..."
        />
      </div>

      {/* 공개 여부 */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span className="text-sm">공개 레시피 (재료 공개)</span>
      </label>

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
