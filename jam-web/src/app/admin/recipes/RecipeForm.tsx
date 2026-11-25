'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminBackLink } from '@/components/admin/AdminBackLink'
import type {
  BadgeRow,
  CombinationRecipeRow,
  CombinationRecipeSlotRow,
  CombineRecipeGradeMode,
  CombineSlotBadgeType,
} from '@/types/database'
import MultiBadgeSearchSelect, { badgeLabel, type SelectedBadge } from '@/components/admin/MultiBadgeSearchSelect'
import BadgeBundleSelect, { type SelectedBundle } from '@/components/admin/BadgeBundleSelect'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { MAX_DESCRIPTION_LENGTH, MAX_SLOTS, MIN_ITEM_SLOTS, MIN_SLOTS } from '@/lib/combine/recipe-payload'
import { recipeReleaseState } from '@/lib/combine/visibility'
import { resolveGradeMode } from '@/lib/combine/gradeMode'
import { bundleKey } from '@/lib/admin/recipe-grade-bundles'
import { assertValidPeriod } from '@/lib/admin/recipe-write'
import { cancelReleaseConfirmMessage } from '@/lib/admin/recipe-bulk'
import { formatKstYmdHm, kstLocalInputToIso, toKstLocalInputValue } from '@/lib/admin/kst-format'

type BadgeBrief = Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'type' | 'item_book_id'>

interface Props {
  /** 수정 대상 — 없으면 생성 모드 */
  recipe?: CombinationRecipeRow
  /** 수정 대상의 기존 슬롯 — 생성 모드에서는 전달하지 않는다 */
  slots?: CombinationRecipeSlotRow[]
  badges: BadgeBrief[]
  tribes: { id: string; name: string }[]
  itemBooks: { id: string; name: string }[]
  /** 수정 대상을 가리키는 홈 카드 수 — 0보다 크면 예약 취소 확인 문구에 안내를 덧붙인다(취소는 막지 않는다) */
  cardCount?: number
  /**
   * 수정 대상에 믹스 성공 기록이 있는가 — 있으면 첫 성공자 보상을 켜거나 바꿀 수 없어 칸을 잠근다(저장 API도 거절한다).
   * 티켓 20261114_1705 2회차
   */
  hasSuccessLogs?: boolean
}

/** 슬롯 하나 — 첫 후보 배지를 고르는 순간 badgeType이 고정되고, 이후 다른 타입은 검색에서 제외된다 */
interface SlotState {
  badgeType: CombineSlotBadgeType | null
  badges: SelectedBadge[]
  /** 등급 대응형의 아이템 슬롯이 쓰는 «아이템 배지 묶음» 후보 — 4등급 배지 id가 묶음 단위로 담긴다(티켓 20261114_1705 2회차) */
  bundles: SelectedBundle[]
}

const EMPTY_SLOT: SlotState = { badgeType: null, badges: [], bundles: [] }
/** 등급 대응형에서 새로 만드는 슬롯 — 재료는 아이템 배지 묶음뿐이라 처음부터 아이템 슬롯이다 */
const EMPTY_BUNDLE_SLOT: SlotState = { badgeType: 'item', badges: [], bundles: [] }

const GRADE_MODE_LABEL: Record<CombineRecipeGradeMode, string> = {
  follow_materials: '등급 대응형',
  fixed: '등급 고정형',
}

/** 배지 id를 «컬렉션 + 이름» 묶음으로 모은다. 묶음을 알 수 없는 배지(삭제됨·컬렉션 없음)는 배지 하나가 묶음 하나다 — 저장 때 서버가 거절한다. */
function bundlesFromIds(ids: readonly string[], badgeMap: Map<string, BadgeBrief>): SelectedBundle[] {
  const byKey = new Map<string, SelectedBundle>()
  for (const id of ids) {
    const badge = badgeMap.get(id)
    const key = badge?.item_book_id ? bundleKey(badge.item_book_id, badge.name) : `id:${id}`
    const bundle = byKey.get(key) ?? { key, name: badge?.name ?? id.slice(0, 8), badgeIds: [] }
    bundle.badgeIds.push(id)
    byKey.set(key, bundle)
  }
  return [...byKey.values()]
}

function slotCandidateCount(slot: SlotState, mode: CombineRecipeGradeMode): number {
  return mode === 'follow_materials' && slot.badgeType === 'item' ? slot.bundles.length : slot.badges.length
}

function slotCandidateIds(slot: SlotState, mode: CombineRecipeGradeMode): string[] {
  return mode === 'follow_materials' && slot.badgeType === 'item'
    ? slot.bundles.flatMap((b) => b.badgeIds)
    : slot.badges.map((b) => b.id)
}

type ReleaseMode = 'now' | 'scheduled'

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
      bundles: s.badge_type === 'item' ? bundlesFromIds(s.allowed_badge_ids, badgeMap) : [],
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
export default function RecipeForm({
  recipe,
  slots: initialSlotsRaw,
  badges,
  tribes,
  itemBooks,
  cardCount = 0,
  hasSuccessLogs = false,
}: Props) {
  const editingId = recipe?.id ?? null
  const badgeMap = useMemo(() => new Map(badges.map((b) => [b.id, b])), [badges])

  const [name, setName] = useState(recipe?.name ?? '')
  // 레시피 유형(티켓 20261114_1705 2회차) — 새 레시피의 기본은 등급 대응형이다. 등록한 뒤에는 바꾸지 않는다(재료·보상 구성이 유형마다 달라서다).
  const [gradeMode, setGradeMode] = useState<CombineRecipeGradeMode>(
    recipe ? resolveGradeMode(recipe) : 'follow_materials'
  )
  const isFollow = gradeMode === 'follow_materials'
  // 설명·보상 없음·결과 잠김(티켓 20261018_0055, 마이그레이션 236) — 설명 최대 길이는 서버 검증과 같은 상수를 쓴다.
  const [description, setDescription] = useState(recipe?.description ?? '')
  const [allowNoReward, setAllowNoReward] = useState(recipe?.allow_no_reward ?? false)
  const [rewardLocked, setRewardLocked] = useState(recipe?.reward_locked ?? false)
  const [slots, setSlots] = useState<SlotState[]>(
    initialSlotsRaw && initialSlotsRaw.length > 0
      ? slotsFromRecipe(initialSlotsRaw, badgeMap)
      : recipe
        ? [EMPTY_SLOT, EMPTY_SLOT]
        : [EMPTY_BUNDLE_SLOT, EMPTY_BUNDLE_SLOT]
  )
  const [rewardPoints, setRewardPoints] = useState(recipe ? String(recipe.reward_points ?? 0) : '0')
  const [rewardBadges, setRewardBadges] = useState<SelectedBadge[]>(
    recipe ? rewardBadgesFromRecipe(recipe, badgeMap) : []
  )
  const [rewardBundles, setRewardBundles] = useState<SelectedBundle[]>(
    recipe && resolveGradeMode(recipe) === 'follow_materials' ? bundlesFromIds(recipe.reward_badge_ids ?? [], badgeMap) : []
  )
  // 첫 성공자 보상(티켓 20261114_1705 2회차) — 아이템 배지 중 드랍 제외가 켜진 배지 하나. 비우면 첫 성공자 보상 없음.
  const initialFirstSuccessId = recipe?.first_success_badge_id ?? ''
  const [firstSuccessId, setFirstSuccessId] = useState(initialFirstSuccessId)
  // 공개 시점(티켓 20261001_1158) — 이미 공개된 레시피(종료된 레시피 포함)는 공개 시각을 바꿀 수 없어 읽기 전용
  // 문구로만 보여 주고 저장 때 보내지 않는다(서버도 409로 막는다). 예약 중이면 시각 변경·바로 공개 전환·예약
  // 취소가 된다.
  const [releaseState] = useState(() => (recipe ? recipeReleaseState(recipe) : null))
  const alreadyReleased = releaseState === 'released' || releaseState === 'ended'
  const scheduledFrom = recipe?.valid_from && !alreadyReleased ? recipe.valid_from : null
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>(scheduledFrom ? 'scheduled' : 'now')
  const [validFromLocal, setValidFromLocal] = useState(scheduledFrom ? toKstLocalInputValue(scheduledFrom) : '')
  // 종료 시각(티켓 20261002_0710) — 선택. 공개 뒤에도 바꿀 수 있다(앞당기기·늦추기·지우기). 칸을 바꾸지 않으면
  // 저장 때 보내지 않아 기존 값(초 단위 포함)을 그대로 둔다.
  const initialValidUntilLocal = recipe?.valid_until ? toKstLocalInputValue(recipe.valid_until) : ''
  const [validUntilLocal, setValidUntilLocal] = useState(initialValidUntilLocal)
  const canCancelRelease = Boolean(editingId) && !alreadyReleased
  const [saving, setSaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const itemSlotCount = slots.filter((s) => s.badgeType === 'item').length
  const conditionSlotCount = slots.length - itemSlotCount
  const rewardCount = isFollow ? rewardBundles.length : rewardBadges.length

  async function handleSave() {
    setError(null)

    if (!name.trim()) {
      setError('레시피 이름을 입력해 주세요')
      return
    }

    const emptySlotIdx = slots.findIndex((s) => slotCandidateCount(s, gradeMode) === 0)
    if (emptySlotIdx !== -1) {
      setError(`슬롯마다 후보 배지를 1개 이상 넣어 주세요 (슬롯 ${emptySlotIdx + 1}이 비어 있어요)`)
      return
    }
    if (slots.length < MIN_SLOTS) {
      setError(`슬롯을 ${MIN_SLOTS}개 이상 만들어 주세요`)
      return
    }
    if (slots.length > MAX_SLOTS) {
      setError(`슬롯은 최대 ${MAX_SLOTS}개까지 만들 수 있어요`)
      return
    }
    if (itemSlotCount < MIN_ITEM_SLOTS) {
      setError(
        `아이템 타입 슬롯을 ${MIN_ITEM_SLOTS}개 이상 만들어 주세요. 소각되는 재료가 없는 레시피는 만들 수 없어요`
      )
      return
    }
    const points = Number(rewardPoints || '0')
    if (!Number.isInteger(points) || points < 0) {
      setError('보상 포인트는 0 이상의 정수여야 해요')
      return
    }
    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
      setError(`레시피 설명은 ${MAX_DESCRIPTION_LENGTH}자까지 쓸 수 있어요. 줄여서 다시 입력해 주세요`)
      return
    }
    if (!allowNoReward && points === 0 && rewardCount === 0) {
      setError('보상을 하나 이상 지정해 주세요. 포인트나 배지 중 최소 하나가 필요해요')
      return
    }

    // 이미 공개된 레시피는 공개 시각을 보내지 않는다(undefined). 그 외에는 예약이면 UTC ISO, 바로 공개면 null.
    let validFrom: string | null | undefined
    if (!alreadyReleased) {
      if (releaseMode === 'scheduled') {
        if (!validFromLocal) {
          setError('공개 시각을 선택해 주세요. 바로 공개하려면 「바로 공개」를 골라 주세요')
          return
        }
        const iso = kstLocalInputToIso(validFromLocal)
        if (!iso) {
          setError('공개 시각을 읽을 수 없어요. 날짜와 시각을 다시 선택해 주세요')
          return
        }
        if (new Date(iso).getTime() <= Date.now()) {
          setError('공개 시각이 이미 지났어요. 지금보다 늦은 시각을 고르거나 「바로 공개」로 바꿔 주세요')
          return
        }
        validFrom = iso
      } else {
        validFrom = null
      }
    }

    // 종료 시각 — 칸을 바꾸지 않았으면 보내지 않고(undefined), 비웠으면 null(종료 없음), 값이 있으면 UTC ISO.
    let validUntil: string | null | undefined
    if (validUntilLocal !== initialValidUntilLocal) {
      if (!validUntilLocal) {
        validUntil = null
      } else {
        const iso = kstLocalInputToIso(validUntilLocal)
        if (!iso) {
          setError('종료 시각을 읽을 수 없어요. 날짜와 시각을 다시 선택해 주세요.')
          return
        }
        validUntil = iso
      }
    }

    // 공개 시각과 종료 시각의 순서 — 서버(생성·수정 API)와 같은 함수로 먼저 거른다. 제출하지 않은 쪽은 기존 값으로 비교한다.
    const period = assertValidPeriod(recipe ?? null, validFrom, validUntil)
    if (!period.ok) {
      setError(period.error)
      return
    }

    // 지난 시각으로 바꾸면 저장 즉시 유저에게서 사라진다 — 확인을 거친다(되돌리려면 종료 시각을 늦추거나 지운다).
    if (typeof validUntil === 'string' && new Date(validUntil).getTime() <= Date.now()) {
      if (!confirm('저장하면 이 레시피가 바로 유저에게서 사라져요.')) return
    }

    setSaving(true)
    const payload = {
      name: name.trim(),
      grade_mode: gradeMode,
      // 등급 대응형은 고른 묶음마다 4등급 배지 id를 모두 담는다(저장 API가 4등급이 갖춰졌는지 다시 본다).
      slots: slots.map((s) => ({
        badge_type: s.badgeType,
        allowed_badge_ids: slotCandidateIds(s, gradeMode),
      })),
      reward_points: points,
      reward_badge_ids: isFollow ? rewardBundles.flatMap((b) => b.badgeIds) : rewardBadges.map((b) => b.id),
      first_success_badge_id: firstSuccessId === '' ? null : firstSuccessId,
      description: description.trim() === '' ? null : description.trim(),
      reward_locked: rewardLocked,
      allow_no_reward: allowNoReward,
      ...(validFrom !== undefined ? { valid_from: validFrom } : {}),
      ...(validUntil !== undefined ? { valid_until: validUntil } : {}),
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

  /** 예약 취소 = 레시피 삭제 — 공개 전에만 된다. 삭제 가드와 공개 여부 확인은 서버가 한다 */
  async function handleCancelRelease() {
    if (!editingId) return
    if (!confirm(cancelReleaseConfirmMessage(cardCount))) return
    setError(null)
    setCanceling(true)
    try {
      const res = await fetch(`/api/admin/recipes/${editingId}/cancel-release`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? '예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      router.push('/admin/recipes')
      router.refresh()
    } catch {
      setError('네트워크 오류로 예약을 취소하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      setCanceling(false)
    }
  }

  function setSlotBadges(idx: number, next: SelectedBadge[]) {
    setSlots((prev) => {
      const copy = [...prev]
      const current = copy[idx]
      // 최초 후보가 생기는 순간 그 배지의 타입으로 슬롯 타입을 고정한다.
      const badgeType = current.badgeType ?? (next[0]?.type as CombineSlotBadgeType | undefined) ?? null
      copy[idx] = { badgeType, badges: next, bundles: current.bundles }
      return copy
    })
  }

  function setSlotBundles(idx: number, next: SelectedBundle[]) {
    setSlots((prev) => prev.map((slot, i) => (i === idx ? { ...slot, bundles: next } : slot)))
  }

  function addSlot() {
    setSlots((prev) => (prev.length >= MAX_SLOTS ? prev : [...prev, isFollow ? EMPTY_BUNDLE_SLOT : EMPTY_SLOT]))
  }

  /**
   * 레시피 유형을 바꾼다(새 레시피 등록 때만 — 수정 화면에서는 고를 수 없다). 유형마다 재료·보상 고르는 단위가 달라(묶음 / 배지 하나) 이미 고른 아이템 재료와
   * 보상 배지는 비운다. 보유 조건 슬롯(액티비티·체크인)은 그대로 둔다.
   */
  function changeGradeMode(next: CombineRecipeGradeMode) {
    if (next === gradeMode) return
    const hasPicked =
      rewardBadges.length > 0 ||
      rewardBundles.length > 0 ||
      slots.some((s) => s.badgeType === 'item' && (s.badges.length > 0 || s.bundles.length > 0))
    if (hasPicked && !confirm('유형을 바꾸면 고른 재료 배지와 보상 배지가 비워져요. 바꿀까요?')) return
    setGradeMode(next)
    setRewardBadges([])
    setRewardBundles([])
    setSlots((prev) =>
      prev.map((s) => {
        if (s.badgeType !== 'item') return s
        return next === 'follow_materials' ? EMPTY_BUNDLE_SLOT : EMPTY_SLOT
      })
    )
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

      {/* 레시피 유형(티켓 20261114_1705 2회차) — 등급 대응형은 재료를 모두 같은 등급으로 넣으면 같은 등급의 결과가 나온다. 등록한 뒤에는 바꾸지 않는다 */}
      <div>
        <label htmlFor="recipe-grade-mode" className="text-xs text-muted-foreground mb-2 block break-keep wrap-break-word">
          레시피 유형 — 등급 대응형은 재료를 같은 등급으로 넣으면 그 등급의 결과가 나와요. 등급 고정형은 정해 둔 배지끼리만 바뀌어요
        </label>
        <Select
          value={gradeMode}
          onValueChange={(v) => changeGradeMode(v as CombineRecipeGradeMode)}
          disabled={Boolean(editingId)}
        >
          <SelectTrigger id="recipe-grade-mode" className="w-auto min-w-[12rem]" aria-label="레시피 유형">
            <SelectValue placeholder="레시피 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="follow_materials">{GRADE_MODE_LABEL.follow_materials}</SelectItem>
            <SelectItem value="fixed">{GRADE_MODE_LABEL.fixed}</SelectItem>
          </SelectContent>
        </Select>
        {editingId && (
          <p className="text-xs text-muted-foreground mt-1 break-keep wrap-break-word text-balance">
            등록한 레시피는 유형을 바꿀 수 없어요. 다른 유형이 필요하면 새 레시피로 등록해 주세요.
          </p>
        )}
      </div>

      {/* 설명(티켓 20261018_0055) — 유저에게 보이는 레시피 설명. 비우면 설명 없음 */}
      <div>
        <label htmlFor="recipe-description" className="text-xs text-muted-foreground mb-2 block break-keep wrap-break-word">
          레시피 설명 (선택) — 유저 화면에 노출돼요. 비워 두면 설명 없이 보여요
        </label>
        <Textarea
          id="recipe-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="레시피 설명을 입력하세요"
          aria-describedby="recipe-description-count"
          className="max-w-md resize-y"
        />
        <p id="recipe-description-count" className="text-xs text-muted-foreground mt-1">
          {description.length}/{MAX_DESCRIPTION_LENGTH}자
        </p>
      </div>

      {/* 슬롯 — 슬롯 하나에 후보 배지(OR)를 여러 개 담는다. 첫 후보로 타입이 고정된다 */}
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">
          슬롯 — 슬롯마다 후보를 여러 개 지정할 수 있고, 유저는 그중 하나만 채우면 돼요.
          아이템 배지는 <b>소모</b>되고, 액티비티·체크인 배지는 <b>보유 조건</b>으로만 검증돼요
          (슬롯 {MIN_SLOTS}~{MAX_SLOTS}개, 아이템 타입 슬롯 {MIN_ITEM_SLOTS}개 이상 필요)
          {isFollow && ' 등급 대응형은 같은 컬렉션·같은 이름의 4등급이 모두 있는 아이템 배지 묶음만 후보로 고를 수 있어요.'}
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
              {isFollow && slot.badgeType === 'item' ? (
                <BadgeBundleSelect
                  key={`${editingId ?? 'new'}-slot-${i}`}
                  selected={slot.bundles}
                  onChange={(next) => setSlotBundles(i, next)}
                  tribes={tribes}
                  itemBooks={itemBooks}
                  placeholder={`슬롯 ${i + 1} 후보 배지 묶음 검색...`}
                />
              ) : (
                <MultiBadgeSearchSelect
                  key={`${editingId ?? 'new'}-slot-${i}`}
                  selected={slot.badges}
                  onChange={(next) => setSlotBadges(i, next)}
                  tribes={tribes}
                  itemBooks={itemBooks}
                  badgeType={slot.badgeType}
                  placeholder={`슬롯 ${i + 1} 후보 배지 검색...`}
                />
              )}
              {slot.badgeType && !(isFollow && slot.badgeType === 'item') && (
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
          {isFollow ? (
            <>
              <label className="text-xs text-muted-foreground mb-2 block break-keep wrap-break-word">
                보상 배지 묶음 — 4등급이 모두 있는 묶음만 고를 수 있어요. 재료 등급과 같은 등급의 배지가 지급돼요
              </label>
              <BadgeBundleSelect
                key={`${editingId ?? 'new'}-reward-bundles`}
                selected={rewardBundles}
                onChange={setRewardBundles}
                tribes={tribes}
                itemBooks={itemBooks}
                placeholder="보상 배지 묶음 검색..."
              />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        {/* 첫 성공자 보상(티켓 20261114_1705 2회차) — 이 레시피로 처음 믹스에 성공한 유저 한 명에게만 일반 결과와 함께 주는 아이템 배지.
            다른 경로(드랍·캡슐 등)에서 나오지 않도록 드랍 제외가 켜진 배지만 고를 수 있다. 이미 성공한 유저가 있으면 켜거나 바꿀 수 없다 */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block break-keep wrap-break-word">
            첫 성공자 보상 (선택) — 이 레시피로 가장 먼저 성공한 유저 1명에게만 일반 결과와 함께 지급돼요. 드랍 제외가 켜진 아이템 배지만 고를 수 있어요
          </label>
          {hasSuccessLogs ? (
            <p className="text-sm text-muted-foreground break-keep wrap-break-word text-balance">
              이미 믹스에 성공한 유저가 있어 첫 성공자 보상을 바꿀 수 없어요.
              {initialFirstSuccessId ? ' 지금은 보상이 지정돼 있어요.' : ' 지금은 지정된 보상이 없어요.'}
            </p>
          ) : (
            <BadgeSearchSelect
              key={`${editingId ?? 'new'}-first-success`}
              value={firstSuccessId}
              onChange={setFirstSuccessId}
              initialLabel={initialFirstSuccessId ? (badgeMap.get(initialFirstSuccessId)?.name ?? initialFirstSuccessId) : ''}
              typeFilter="item"
              dropExcludedOnly
              placeholder="첫 성공자 보상 배지 검색..."
            />
          )}
        </div>
        {/* 보상 없음(티켓 20261018_0055) — 켠 레시피만 포인트 0·보상 배지 없음으로 저장된다. 꺼 두면 보상 하나 이상이 필요하다 */}
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="recipe-allow-no-reward"
            checked={allowNoReward}
            onCheckedChange={(v) => setAllowNoReward(v === true)}
            aria-describedby="recipe-allow-no-reward-help"
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="recipe-allow-no-reward"
              className="cursor-pointer text-sm font-medium text-foreground break-keep wrap-break-word"
            >
              보상 없음
            </label>
            <p id="recipe-allow-no-reward-help" className="text-xs text-muted-foreground break-keep wrap-break-word text-balance">
              켜면 포인트와 보상 배지를 모두 비워도 저장돼요. 끄면 보상을 하나 이상 지정해야 해요.
            </p>
          </div>
        </div>
        {/* 결과 잠김 — 켠 레시피의 보상 아이템 배지는 잠긴 채 지급된다. 끄면 열린 채 지급된다 */}
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="recipe-reward-locked"
            checked={rewardLocked}
            onCheckedChange={(v) => setRewardLocked(v === true)}
            aria-describedby="recipe-reward-locked-help"
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="recipe-reward-locked"
              className="cursor-pointer text-sm font-medium text-foreground break-keep wrap-break-word"
            >
              결과를 잠긴 채 지급
            </label>
            <p id="recipe-reward-locked-help" className="text-xs text-muted-foreground break-keep wrap-break-word text-balance">
              켜면 이 레시피로 받는 아이템 배지가 잠긴 채 나와요. 끄면 열린 채 나와요.
            </p>
          </div>
        </div>
      </div>

      {/* 공개 시점 — 바로 공개 또는 시각을 정해 예약. 내리는 길은 아래 종료 시각이고, 예약 취소는 삭제다 */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-bold">공개 시점</p>
        {alreadyReleased ? (
          <p className="text-sm text-muted-foreground">
            {recipe?.valid_from
              ? `${formatKstYmdHm(recipe.valid_from)}에 공개됐어요. 공개된 레시피는 공개 시각을 바꿀 수 없어요.`
              : '처음부터 공개돼 있어요. 공개된 레시피는 공개 시각을 바꿀 수 없어요.'}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="release-mode"
                  checked={releaseMode === 'now'}
                  onChange={() => setReleaseMode('now')}
                />
                바로 공개
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="release-mode"
                  checked={releaseMode === 'scheduled'}
                  onChange={() => setReleaseMode('scheduled')}
                />
                시각을 정해 예약
              </label>
            </div>
            {releaseMode === 'scheduled' ? (
              <div>
                <label htmlFor="recipe-valid-from" className="text-xs text-muted-foreground mb-1 block">
                  공개 시각 (한국 시간) — 이 시각 전에는 유저에게 보이지 않아요
                </label>
                <input
                  id="recipe-valid-from"
                  type="datetime-local"
                  value={validFromLocal}
                  onChange={(e) => setValidFromLocal(e.target.value)}
                  className="bg-white border border-border rounded-xl px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">저장하면 바로 유저에게 공개돼요</p>
            )}
          </>
        )}
      </div>

      {/* 종료 시각 — 선택, 한국 시간. 비우면 계속 공개된다. 공개된 레시피도 고칠 수 있고(Q2), 지난 시각으로 저장하면 곧바로 내려간다 */}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-bold">종료 시각 (선택)</p>
        <div>
          <label htmlFor="recipe-valid-until" className="text-xs text-muted-foreground mb-1 block">
            종료 시각 (한국 시간) — 이 시각부터 유저에게서 사라져요. 비워 두면 계속 공개돼요
          </label>
          <div className="flex items-center gap-3">
            <input
              id="recipe-valid-until"
              type="datetime-local"
              value={validUntilLocal}
              onChange={(e) => setValidUntilLocal(e.target.value)}
              className="bg-white border border-border rounded-xl px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setValidUntilLocal('')}
              disabled={!validUntilLocal}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              종료 시각 지우기
            </button>
          </div>
        </div>
        {releaseState === 'ended' && (
          <p className="text-xs text-muted-foreground">
            이미 종료된 레시피예요. 종료 시각을 늦추거나 지우면 다시 공개돼요.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || canceling}
          className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중...' : editingId ? '수정 저장' : '저장'}
        </button>
        <AdminBackLink fallbackHref="/admin/recipes" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          취소
        </AdminBackLink>
        {canCancelRelease && (
          <button
            onClick={handleCancelRelease}
            disabled={saving || canceling}
            className="ml-auto text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            {canceling ? '취소하는 중...' : '예약 취소'}
          </button>
        )}
      </div>
    </div>
  )
}
