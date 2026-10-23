'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import { useToast } from '@/components/ui/Toast'
import BottomSheet from '@/components/ui/BottomSheet'
import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { MixerSlot } from '@ds/components/patterns/MixerSlot'
import { Button } from '@ds/components/buttons/Button'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { SearchIcon, PackageIcon, ChevronRightIcon } from '@/components/ui/icons'
import RecipeRewardRow from './RecipeRewardRow'
import PendingResultsSheet, { type PendingSheetView } from './PendingResultsSheet'
import BagItemCell from './BagItemCell'
import TierUpPanel from './TierUpPanel'
import {
  TIER_UP_ENDPOINT,
  buildTierUpCollectionView,
  buildTierUpSheet,
  emptyTierUpSlots,
  fillTierUpSlot,
  groupTierUpMaterials,
  hasEnoughTierUpGroup,
  lockedTierUpRarity,
  nextEmptyTierUpSlot,
  pickableTierUpIds,
  removeTierUpSlot,
  resolveTierUpSlots,
  tierUpRarityNote,
  tierUpRejection,
  tierUpResultMessage,
  tierUpSubmitIds,
  type TierUpCollectionOption,
  type TierUpRequest,
  type TierUpResultBadge,
  type TierUpSlots,
} from './tierUpClient'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'
import { isLockedItemBody } from '@/lib/inventory/locked-item-block'
import { StepSaveFailedError } from '@/lib/onboarding-quest/step-error'
import { trackQuestStepComplete } from '@/lib/onboarding-quest/analytics'
// 타입만 가져온다 — `lib/combine/pending.ts`는 서버 전용이라 값을 가져오면 번들링에서 터진다.
import type { PendingResultView, PendingResultsPayload } from '@/lib/combine/pending'
import type { BadgeRow, CombinationRecipeRow, CombineSlotBadgeType, InventoryItemRow } from '@/types/database'

/** 온보딩 퀘스트 4~5단계(T4)의 demo-data.ts가 연출 재료 타입으로도 쓴다(export). */
export interface InventoryItemWithBadge extends Pick<InventoryItemRow, 'id' | 'badge_id' | 'serial_prefix' | 'serial_number'> {
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
  /**
   * 공개 시각 — 서버(`page.tsx`)가 «공개 전 레시피를 운영자에게 보여 줄 때만» `valid_from` 값을 넣는다
   * (티켓 20261001_1159). 공개된 레시피는 운영자에게도 없거나 null이고, 종료된 레시피는 운영자에게도 목록에
   * 없다(티켓 20261002_0710). 클라이언트는 행 전체에 딸려 오는 `valid_from`·`valid_until`로 공개 여부를 다시
   * 판정하지 않는다. 온보딩 연출 레시피(`DEMO_MIX_RECIPE`)에는 없다.
   */
  releaseAt?: string | null
}

interface Props {
  items: InventoryItemWithBadge[]
  publicRecipes: RecipeWithSlots[]
  /** 유저가 실제로 보유한 조건 슬롯(액티비티·체크인) 후보 배지 id — 서버가 미리 조회해 내려준다 */
  ownedConditionBadgeIds: string[]
  /**
   * 온보딩 퀘스트 4~5단계(mix_fail=레시피 확인, mix_success=믹스 성공) 차례일 때만 채워진다
   * (티켓 20260927_2127, 상위 20260927_2123 T4). 차례가 아니면 null — 화면은 평소 `/combine`
   * 그대로다(결정 22).
   */
  questStep?: 'mix_fail' | 'mix_success' | null
  /**
   * 받지 않은 믹스 결과 개수 — 서버(`page.tsx`)가 읽어 내려준다(티켓 20261018_0055 2회). 0보다 크면 배너를 띄우고 새 믹스를
   * 막는다. 온보딩 연출 모드에서는 서버가 0을 내리고, 클라이언트도 0으로 본다.
   */
  pendingCount?: number
  /**
   * 등급 올리기에서 고를 수 있는 컬렉션 — 서버(`page.tsx`)가 소속 트라이브의 열린 컬렉션을 읽어 내려준다(티켓 20261023_1648 3회). 화면은 재료 등급에 맞는 것만
   * 걸러 보인다. `null`은 «읽지 못했다»(빈 배열 «읽었더니 없다»와 다르다). 온보딩 연출 중에는 서버가 조회를 건너뛰고 빈 배열을 내린다.
   */
  tierUpCollections?: TierUpCollectionOption[] | null
}

/** 받지 않은 결과 목록을 기다리는 최대 시간 — 넘으면 오류로 넘어가 «다시 불러오기»를 보인다 */
const PENDING_LOAD_TIMEOUT_MS = 8000
/** 서버 응답 `code` — `/api/combine`(409)과 `/api/combine/pending`(409) */
const PENDING_RESULTS_EXIST = 'pending_results_exist'
const INSUFFICIENT_SLOTS = 'insufficient_slots'
const NO_PENDING = 'no_pending'

const INITIAL_SHEET: PendingSheetView = { status: 'loading', items: [], freeSlots: 0, neededSlots: 0, claiming: false }

/** 믹스 응답의 결과 배지 한 줄(`CombineResult.resultBadges`) — 잠긴 것은 `locked`가 참이고 id·이름이 빈 문자열이다 */
interface MixResultBadge {
  id: string
  name: string
  rarity?: RevealBadge['rarity']
  locked?: boolean
  unlockRequired?: number
}

/**
 * 순수 변환 — 믹스 응답의 결과 배지를 결과 캐러셀 항목으로 바꾼다. 열린 결과는 이미 로드해 둔 보상 배지 상세에서 찾고(API는
 * id·name·rarity만 준다), 잠긴 결과는 id가 비어 있어 상세를 찾을 수 없으므로 등급과(응답에 있으면) 필요한 양만 싣는다.
 * 잠긴 항목의 id는 캐러셀 키 용도의 합성 값이다. 필요한 양이 응답에 없으면 싣지 않는다 — 추측해 채우지 않는다(티켓 20261018_0055 2회).
 */
export function toMixRevealBadges(resultBadges: MixResultBadge[], rewardBadges: BadgeDetail[]): RevealBadge[] {
  return resultBadges.map((b, index): RevealBadge => {
    if (b.locked === true) {
      return {
        id: `locked-${index}`,
        name: '',
        description: '',
        rarity: b.rarity,
        locked: true,
        ...(typeof b.unlockRequired === 'number' ? { unlockRequired: b.unlockRequired } : {}),
      }
    }
    const detail = rewardBadges.find((rb) => rb.id === b.id)
    return {
      id: b.id,
      name: detail?.name ?? b.name,
      description: detail?.description ?? '',
      imageUrl: detail?.image_url,
      rarity: detail?.rarity,
    }
  })
}

/**
 * 순수 변환 — 등급 올리기 응답의 결과 배지를 결과 캐러셀 항목으로 바꾼다(티켓 20261022_2119 3회). 등급 올리기에는 레시피가 없어
 * 보상 배지 상세를 미리 로드해 둘 수 없으므로, 응답이 싣는 `imageUrl`·`rarity`로 상세를 만들어 `toMixRevealBadges`의 규칙을 그대로 쓴다
 * (잠긴 결과는 이름·그림 없이 가린 카드). `imageUrl`이 없으면 카드는 기본 아이콘으로 나온다.
 */
export function toTierUpRevealBadges(resultBadges: TierUpResultBadge[]): RevealBadge[] {
  const details: BadgeDetail[] = resultBadges
    .filter((b) => b.locked !== true)
    .map((b) => ({ id: b.id, name: b.name, image_url: b.imageUrl ?? null, rarity: b.rarity ?? null, description: '' }))
  return toMixRevealBadges(resultBadges, details)
}

/** 순수 변환 — 받은 «받지 않은 결과» 목록을 결과 캐러셀 항목으로 바꾼다. 잠긴 결과를 열린 척 보이지 않는다. */
export function toPendingRevealBadges(items: PendingResultView[]): RevealBadge[] {
  return items.map((item): RevealBadge => {
    const rarity = item.rarity as RevealBadge['rarity']
    if (item.locked) {
      return {
        id: `locked-${item.id}`,
        name: '',
        description: '',
        rarity,
        locked: true,
        ...(typeof item.unlockRequired === 'number' && item.unlockRequired > 0 ? { unlockRequired: item.unlockRequired } : {}),
      }
    }
    return { id: item.badgeId, name: item.name, description: '', imageUrl: item.imageUrl, rarity }
  })
}

/**
 * 순수 문구 — 믹스 직후 결과가 받지 않은 상태로 남았을 때의 오버레이 문구. 서버 `message`를 쓰지 않고 숫자를 넣어 만든다.
 * 포인트는 결과와 별개로 먼저 지급되므로 있으면 한 문장을 더한다.
 */
export function pendingResultMessage(params: { pendingCount: number; freeSlots: number; points: number }): string {
  const base = t(d.combine.resultPendingCounts, { count: params.pendingCount, free: params.freeSlots })
  if (params.points <= 0) return base
  return `${base} ${t(d.combine.resultPendingPoints, { points: params.points.toLocaleString() })}`
}

/**
 * 레시피 설명 — 믹서 화면의 요약 행 아래. 3줄까지 보이고, 넘칠 때만 «더 보기»가 붙는다. 높이 전환 없이 줄임만 풀고 접는다.
 * 넘침은 접힌 상태의 실제 높이로 잰다(글자 수로 추측하지 않는다). 레시피를 바꾸면 `key`로 다시 접힌다.
 */
export function RecipeDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || expanded || typeof ResizeObserver === 'undefined') return
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [expanded, text])

  return (
    <div className="px-4 pb-4 flex flex-col items-start">
      <p
        ref={ref}
        className={[
          'm-0 w-full text-sm text-foreground whitespace-pre-line break-keep wrap-break-word text-pretty',
          expanded ? '' : 'line-clamp-3',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="min-h-11 text-sm whitespace-nowrap text-[color:var(--link)]"
        >
          {expanded ? d.combine.descriptionLess : d.combine.descriptionMore}
        </button>
      )}
    </div>
  )
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

/**
 * 순수 판정 — 결과 오버레이를 닫는 순간 띄울 시험 믹스 안내 문구(없으면 null). 서버 응답의 `testMix`만
 * 근거로 삼는다: 화면을 열어 둔 사이 공개 시각이 지났다면 서버는 일반 믹스로 기록하므로, 클라이언트가
 * `releaseAt`으로 추측하면 거짓 안내가 나간다(티켓 20261001_1159).
 */
export function testMixNoticeOnClose(result: { testMix?: boolean } | null): string | null {
  return result?.testMix ? d.combine.testMixNotice : null
}

/** 보상 없음으로 정한 레시피 — 보상 배지 없음, 포인트 0(서버 응답의 `noReward`와 같은 기준) */
function isNoRewardRecipe(recipe: RecipeWithSlots): boolean {
  return (recipe.reward_badge_ids ?? []).length === 0 && recipe.reward_points <= 0
}

/** 표시용 이름 — 기존 레시피(마이그레이션 175 이전 데이터)는 name이 NULL일 수 있다(티켓 20260917_1828) */
function recipeDisplayName(recipe: RecipeWithSlots): string {
  return recipe.name ?? d.combine.unnamedRecipe
}

/**
 * 순수 판정 — 가방 시트를 열 때 `mix_fail`을 기록할 차례인지. `demoMode`가 아니거나 이미
 * 기록했으면 기록하지 않는다(티켓 20260927_2127, `screen-gate.ts`의 순수/DB 분리 패턴).
 */
export function shouldRecordMixFail(demoMode: boolean, alreadyRecorded: boolean): boolean {
  return demoMode && !alreadyRecorded
}

/**
 * 순수 빌더 — 연출 믹스 성공 시 실제 `/api/combine` 응답 대신 로컬에서 구성하는 결과값.
 * `selectedRecipe.rewardBadges`·`reward_points`를 그대로 옮긴다(티켓 20260927_2127).
 */
export function buildDemoCombineResult(recipe: RecipeWithSlots): {
  success: true
  badges: RevealBadge[]
  points: number
} {
  return {
    success: true,
    badges: recipe.rewardBadges.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      imageUrl: b.image_url,
      rarity: b.rarity,
    })),
    points: recipe.reward_points,
  }
}

/**
 * 순수 판정 — 펄스 판정에 쓸 단계. 가방을 처음 열어 `mix_fail`을 기록하면(`mixFailRecorded`)
 * 같은 화면에서 5단계로 이어지므로 `mix_success` 규칙으로 바꾼다(티켓 20260928_2155).
 */
export function resolveQuestPulseStep(
  questStep: 'mix_fail' | 'mix_success' | null,
  mixFailRecorded: boolean,
): 'mix_fail' | 'mix_success' | null {
  return questStep === 'mix_fail' && mixFailRecorded ? 'mix_success' : questStep
}

/** `computeQuestPulseTarget()`가 돌려주는 「지금 눌러야 할 요소」 판정 결과 — 항상 최대 1개(결정 7). */
export type QuestPulseTarget =
  | { type: 'recipe' }
  | { type: 'slot'; slotId: string }
  | { type: 'bagRow'; key: string }
  | { type: 'submit' }
  | null

/** `fills`에 없는 첫 슬롯 — `slot_order` 오름차순. 없으면 null(전 슬롯이 채워짐). */
function firstEmptySlot(
  recipe: RecipeWithSlots,
  fills: Record<string, SlotFill>
): RecipeSlotWithCandidates | null {
  return (
    recipe.slots
      .slice()
      .sort((a, b) => a.slot_order - b.slot_order)
      .find((s) => !fills[s.id]) ?? null
  )
}

/**
 * 순수 판정 — 온보딩 퀘스트 4~5단계(`mix_fail`·`mix_success`)에서 지금 반짝여야 할 요소
 * 하나를 고른다(티켓 20260928_1755, 채원 판정). 슬롯 펄스·제출 버튼 펄스·후보 행 펄스를
 * 각각 독립 조건으로 산개하지 않고 이 함수 하나로 모아 상호 배타를 강제한다(craft_notes).
 *
 * - 퀘스트 차례가 아니거나(`questStep` null) 제출 중(`loading`)이면 항상 null.
 * - 레시피 미선택: 레시피 행(`mix_fail`·`mix_success` 공통, 사용자 승인 결정 1).
 * - `mix_fail` 선택 후: 첫 빈 슬롯(시트 열림 여부 무관, 완료 조건 원문). 빈 슬롯이 없으면 null —
 *   가방을 여는 순간 단계가 이미 기록되므로 제출 버튼까지 도달하는 경로를 정의하지 않는다.
 * - `mix_success` 선택 후: 시트 열림 → 그 슬롯의 활성 후보 행 중 첫 번째(craft_notes 방어적 고정).
 *   시트 닫힘 + 빈 슬롯 있음 → 다음 빈 슬롯. 시트 닫힘 + `canSubmit` → 조합하기 버튼.
 */
export function computeQuestPulseTarget(params: {
  questStep: 'mix_fail' | 'mix_success' | null
  loading: boolean
  selectedRecipe: RecipeWithSlots | null
  fills: Record<string, SlotFill>
  bagSlotId: string | null
  bagRows: BagRow[]
  canSubmit: boolean
}): QuestPulseTarget {
  const { questStep, loading, selectedRecipe, fills, bagSlotId, bagRows, canSubmit } = params
  if (questStep !== 'mix_fail' && questStep !== 'mix_success') return null
  if (loading) return null
  if (!selectedRecipe) return { type: 'recipe' }

  if (questStep === 'mix_fail') {
    const empty = firstEmptySlot(selectedRecipe, fills)
    return empty ? { type: 'slot', slotId: empty.id } : null
  }

  // mix_success
  if (bagSlotId) {
    const activeRow = bagRows.find((r) => r.state === 'active')
    return activeRow ? { type: 'bagRow', key: activeRow.key } : null
  }
  if (canSubmit) return { type: 'submit' }
  const empty = firstEmptySlot(selectedRecipe, fills)
  return empty ? { type: 'slot', slotId: empty.id } : null
}

export default function CombineClient({
  items,
  publicRecipes,
  ownedConditionBadgeIds,
  questStep = null,
  pendingCount: serverPendingCount = 0,
  tierUpCollections = [],
}: Props) {
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
    /** 서버 응답의 testMix — 운영자의 공개 전 시험 믹스(티켓 20261001_1159) */
    testMix?: boolean
    /** 오버레이 위 한 줄 결과 문구(받기 성공 연출) — `emptyMessage`와 달리 캐러셀 위에 얹힌다 */
    resultMessage?: string
    /** 어디서 온 결과인가 — `claim`(받지 않은 결과 받기)은 믹서의 채운 슬롯을 건드리지 않고, `tierUp`은 등급 올리기의 담은 칸을 비운다 */
    kind?: 'mix' | 'claim' | 'tierUp'
    /** 오버레이를 닫는 순간 배너가 가리킬 받지 않은 결과 개수(닫은 뒤 서버 값을 다시 읽는다) */
    pendingAfterClose?: number
  } | null>(null)
  /**
   * 받지 않은 결과 개수 — 서버 값(`pendingCount` prop)이 기준이고, 이 화면에서 개수가 바뀌는 순간(받기 성공·목록 읽기·409·믹스 직후
   * 결과가 받지 않은 상태로 남음)에만 덮어쓴다. 덮어쓰는 모든 곳이 `router.refresh()`로 서버 값을 다시 받는다.
   */
  const [pendingOverride, setPendingOverride] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheet, setSheet] = useState<PendingSheetView>(INITIAL_SHEET)
  /**
   * 등급 올리기(티켓 20261022_2119 3회) — 레시피 믹서(`selectedRecipeId`)와 같은 층의 분기다. 담은 칸은 개체 id 5칸이고, 재료 시트가 열려 있는 동안
   * `tierUpTarget`이 다음에 채울 칸을 가리킨다(담을 때마다 다음 빈 칸으로 이어지고 5칸이 차면 시트가 닫힌다).
   */
  const [tierUpOpen, setTierUpOpen] = useState(false)
  const [tierUpSlots, setTierUpSlots] = useState<TierUpSlots>(emptyTierUpSlots)
  const [tierUpSheetOpen, setTierUpSheetOpen] = useState(false)
  const [tierUpTarget, setTierUpTarget] = useState(0)
  const [tierUpLoading, setTierUpLoading] = useState(false)
  /**
   * 고른 컬렉션 id와 컬렉션 시트 열림 — 결과를 받은 뒤 같은 화면에 있는 동안은 고른 컬렉션을 유지하고(같은 컬렉션을 연달아 채우는 흐름) 화면을 나가면 비운다.
   * 지금 목록에 없는 선택은 아래 `tierUpCollectionView`가 걸러 보이지도 제출되지도 않게 한다(여기 값은 지우지 않는다).
   */
  const [tierUpCollectionPick, setTierUpCollectionPick] = useState<string | null>(null)
  const [tierUpCollectionSheetOpen, setTierUpCollectionSheetOpen] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  /** 온보딩 퀘스트 4~5단계 연출 모드 — 실제 `/api/combine`·`trackEvent`·`router.refresh()`를 부르지 않는다. */
  const demoMode = questStep === 'mix_fail' || questStep === 'mix_success'
  const [mixFailRecorded, setMixFailRecorded] = useState(false)
  /** 연출 모드에서는 받지 않은 결과를 0으로 본다 — 배너·받기·CTA 차단 모두 비활성(채원 판정) */
  const pendingCount = demoMode ? 0 : (pendingOverride ?? serverPendingCount)
  const pendingBlocked = pendingCount > 0

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

  // 등급 올리기 — 목록에서 찾을 수 없는 개체(새로고침으로 사라진 것)를 담은 칸에서 걸러 유령 칸을 만들지 않는다.
  const tierUpGroups = groupTierUpMaterials(items)
  const tierUpFilled = resolveTierUpSlots(tierUpSlots, items)
  const tierUpVisibleSlots: TierUpSlots = tierUpFilled.map((item) => item?.id ?? null)
  const tierUpSheet = buildTierUpSheet(tierUpGroups, tierUpFilled)
  const tierUpLockedRarity = lockedTierUpRarity(tierUpFilled)
  const tierUpSubmitItemIds = tierUpSubmitIds(tierUpFilled)
  const tierUpCollectionView = buildTierUpCollectionView(tierUpCollections, tierUpLockedRarity, tierUpCollectionPick)
  /** 제출에 쓰는 컬렉션 — 재료가 없거나 새 등급의 목록에 없는 선택은 null이다 */
  const tierUpCollectionId = tierUpCollectionView.kind === 'ready' ? tierUpCollectionView.selectedId : null

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

  function openTierUp() {
    setTierUpOpen(true)
    setTierUpSlots(emptyTierUpSlots())
    setTierUpCollectionPick(null)
    setTierUpCollectionSheetOpen(false)
    setResult(null)
  }

  function closeTierUp() {
    setTierUpOpen(false)
    setTierUpSlots(emptyTierUpSlots())
    setTierUpSheetOpen(false)
    setTierUpCollectionPick(null)
    setTierUpCollectionSheetOpen(false)
  }

  function openTierUpSheet(slotIndex: number) {
    setTierUpTarget(slotIndex)
    // 두 시트가 동시에 열리지 않게 한쪽을 열 때 다른 쪽을 닫는다
    setTierUpCollectionSheetOpen(false)
    setTierUpSheetOpen(true)
  }

  /** 컬렉션 시트를 연다 — 고를 목록이 있을 때(ready)만, 제출 중에는 열지 않는다 */
  function openTierUpCollectionSheet() {
    if (tierUpLoading || tierUpCollectionView.kind !== 'ready') return
    setTierUpSheetOpen(false)
    setTierUpCollectionSheetOpen(true)
  }

  /** 시트의 줄을 눌러 컬렉션을 고르고 시트를 바로 닫는다 — 확정은 화면의 «등급 올리기» 버튼이다. 지금 목록에 없는 id는 무시한다 */
  function pickTierUpCollection(collectionId: string) {
    if (tierUpCollectionView.kind !== 'ready' || !tierUpCollectionView.choices.some((choice) => choice.id === collectionId)) return
    setTierUpCollectionPick(collectionId)
    setTierUpCollectionSheetOpen(false)
  }

  /**
   * 재료 시트에서 개체를 담는다 — 누른 칸부터 다음 빈 칸으로 이어서 채우고 5칸이 차면 시트를 닫는다. 시트가 비활성으로 그린 개체
   * (다른 등급, 5개 미만 묶음, 이미 담은 것)는 한 번 더 걸러 다른 등급이 섞인 제출이 화면에서 만들어지지 않게 한다.
   */
  function pickTierUpItem(itemId: string) {
    if (!pickableTierUpIds(tierUpSheet).has(itemId)) return
    const index = tierUpVisibleSlots[tierUpTarget] ? nextEmptyTierUpSlot(tierUpVisibleSlots, tierUpTarget) : tierUpTarget
    if (index === null) return
    const next = fillTierUpSlot(tierUpVisibleSlots, index, itemId)
    setTierUpSlots(next)
    const following = nextEmptyTierUpSlot(next, index + 1)
    if (following === null) setTierUpSheetOpen(false)
    else setTierUpTarget(following)
  }

  function removeTierUpItem(slotIndex: number) {
    setTierUpSlots(removeTierUpSlot(tierUpVisibleSlots, slotIndex))
  }

  /**
   * 가방 시트는 기록 결과와 무관하게 연다(시트 오픈이 먼저) — `mix_fail` 기록은 연출
   * 모드에서 처음 열 때 한 번만 시도한다(티켓 20260927_2127 사용자 결정 2). 실패하면
   * 로컬 플래그를 되돌려 다음 슬롯 탭에서 재시도할 수 있게 한다.
   */
  async function openBagFor(slot: RecipeSlotWithCandidates) {
    setBagSlotId(slot.id)
    if (!shouldRecordMixFail(demoMode, mixFailRecorded)) return

    setMixFailRecorded(true)
    try {
      const res = await fetch('/api/onboarding-quest/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'mix_fail' }),
      })
      if (!res.ok) throw new StepSaveFailedError()
      trackQuestStepComplete('mix_fail', await res.json())
    } catch (err) {
      setMixFailRecorded(false)
      if (err instanceof StepSaveFailedError) {
        toast(d.onboardingQuest.mixStepSaveFailed, 'error')
      } else {
        toast(d.common.networkError, 'error')
      }
    }
  }

  /** 화면이 낡아 배너가 없던 경우(409) — 서버의 지금 개수를 읽어 배너를 띄운다. 읽지 못하면 서버 값을 다시 받는다. */
  async function refreshPendingCount() {
    try {
      const res = await fetch('/api/combine/pending')
      if (!res.ok) throw new Error('pending list failed')
      const payload = (await res.json()) as Partial<PendingResultsPayload>
      if (typeof payload.pendingCount !== 'number') throw new Error('pending list malformed')
      setPendingOverride(payload.pendingCount)
    } catch {
      router.refresh()
    }
  }

  /** 받지 않은 결과 시트를 열 때마다 목록과 지금 빈칸 수를 새로 읽는다. 8초 안에 응답이 없으면 오류로 넘어간다. */
  async function loadPending() {
    setSheet((prev) => ({ ...prev, status: 'loading' }))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PENDING_LOAD_TIMEOUT_MS)
    try {
      const res = await fetch('/api/combine/pending', { signal: controller.signal })
      if (!res.ok) throw new Error('pending list failed')
      const payload = (await res.json()) as Partial<PendingResultsPayload>
      const list = payload.items ?? []
      setSheet({ status: 'ready', items: list, freeSlots: Number(payload.freeSlots ?? 0), neededSlots: list.length, claiming: false })
      if (list.length === 0) {
        // 다른 기기에서 이미 받았다 — 배너를 지운다
        setPendingOverride(0)
        router.refresh()
      } else {
        setPendingOverride(list.length)
      }
    } catch {
      setSheet((prev) => ({ ...prev, status: 'error' }))
    } finally {
      clearTimeout(timer)
    }
  }

  function openPendingSheet() {
    setSheetOpen(true)
    void loadPending()
  }

  /** 받지 않은 결과를 전부 한 번에 받는다. 같은 요청을 두 번 보내지 않는다(제출 중 재클릭 막힘). */
  async function handleClaim() {
    if (sheet.claiming) return
    const claimed = sheet.items
    setSheet((prev) => ({ ...prev, claiming: true }))
    try {
      const res = await fetch('/api/combine/pending', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        const count = typeof data.granted === 'number' && data.granted > 0 ? data.granted : claimed.length
        setSheetOpen(false)
        setResult({
          success: true,
          badges: toPendingRevealBadges(claimed),
          points: 0,
          resultMessage: t(d.combine.claimedToast, { count }),
          kind: 'claim',
          pendingAfterClose: 0,
        })
        return
      }
      if (res.status === 403 && data.code === USER_SUSPENDED_CODE) {
        toast(data.error ?? d.suspension.combineClaimBlocked, 'info')
        return
      }
      if (res.status === 409 && data.code === INSUFFICIENT_SLOTS) {
        // 토스트 없이 부족 블록으로 바꾼다
        setSheet((prev) => ({
          ...prev,
          freeSlots: typeof data.free === 'number' ? data.free : prev.freeSlots,
          neededSlots: typeof data.needed === 'number' ? data.needed : prev.neededSlots,
        }))
        return
      }
      if (res.status === 409 && data.code === NO_PENDING) {
        toast(data.error ?? d.combine.claim.noPending, 'info')
        setSheetOpen(false)
        setPendingOverride(0)
        router.refresh()
        return
      }
      toast(data.error ?? d.combine.claim.failed, 'error')
    } catch {
      toast(d.combine.claim.failed, 'error')
    } finally {
      setSheet((prev) => ({ ...prev, claiming: false }))
    }
  }

  async function handleCombine() {
    if (!selectedRecipe || !canSubmit || pendingBlocked) return

    // 온보딩 퀘스트 4~5단계 연출 분기 — 실제 /api/combine·trackEvent·router.refresh()를
    // 전혀 부르지 않는다(티켓 20260927_2127). mix_fail을 멱등 호출하는 것은 가방 시트를
    // 안 열고 바로 슬롯이 채워진 경우를 대비한 순서 안전망이다.
    if (demoMode) {
      setLoading(true)
      setResult(null)
      try {
        const failRes = await fetch('/api/onboarding-quest/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'mix_fail' }),
        })
        if (!failRes.ok) throw new StepSaveFailedError()
        trackQuestStepComplete('mix_fail', await failRes.json())

        const successRes = await fetch('/api/onboarding-quest/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'mix_success' }),
        })
        if (!successRes.ok) throw new StepSaveFailedError()
        trackQuestStepComplete('mix_success', await successRes.json())

        setResult(buildDemoCombineResult(selectedRecipe))
      } catch (err) {
        if (err instanceof StepSaveFailedError) {
          toast(d.onboardingQuest.mixStepSaveFailed, 'error')
        } else {
          toast(d.common.networkError, 'error')
        }
      } finally {
        setLoading(false)
      }
      return
    }

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

      // 이용 정지 — 소각 전에 거절됐다. 오버레이를 열지 않고 채운 슬롯도 그대로 둔다.
      if (res.status === 403 && data.code === USER_SUSPENDED_CODE) {
        toast(data.error ?? d.suspension.combineBlocked, 'info')
        return
      }
      // 받지 않은 결과가 남아 있다 — 소각 전에 거절됐다. 슬롯은 그대로 두고 화면이 낡았을 수 있으니 배너 개수를 다시 읽는다.
      if (res.status === 409 && data.code === PENDING_RESULTS_EXIST) {
        toast(data.message ?? d.combine.pendingResultsExist, 'info')
        await refreshPendingCount()
        return
      }

      // 잠긴 개체가 재료에 섞였다 — 소각 전에 거절됐다. 재료 후보는 잠긴 개체를 이미 빼므로 경합 때만 닿는 안전망이다.
      // 오류가 아니라 안내라 결과 오버레이를 열지 않고 슬롯도 그대로 둔다(티켓 20261018_0056).
      if (isLockedItemBody(res.status, data)) {
        toast(data.message ?? d.lockedItem.combine, 'info')
        return
      }

      const resultBadges = (data.resultBadges ?? []) as MixResultBadge[]
      const points = data.pointsAwarded ?? 0
      // 20260910_1408: 레시피 보상은 배지·포인트를 함께 줄 수 있다. 캐러셀에 넘길 상세는
      // 이미 로드해 둔 selectedRecipe.rewardBadges에서 찾는다(API는 id·name·rarity만 준다).
      // 잠긴 채 나온 결과는 id가 빈 문자열이라 상세를 찾지 않고 가린 카드로 바꾼다.
      const revealBadges = toMixRevealBadges(resultBadges, selectedRecipe.rewardBadges)

      if (data.success) {
        trackEvent('combine_success', {
          item_count: itemIds.length,
          result_badge_ids: resultBadges.map((b) => b.id).filter(Boolean).join(','),
        })
      }

      // 성공(배지 없이 포인트만) · 실패 모두 message는 서버가 완성해 내려준다(ADR 0001, 티켓 20260915_2240).
      // 단 받지 않은 결과로 남은 성공과 보상 없음 성공은 서버 문구를 쓰지 않고 숫자·상황을 넣어 만든다.
      // 결과 배지가 비어 있다는 이유만으로 «포인트만 받음»으로 보내지 않는다 — pending·noReward를 먼저 가른다.
      const pendingResult = data.success === true && data.resultStatus === 'pending'
      const pendingTotal = Number(data.pendingCount ?? 0)
      let message: string | undefined
      if (pendingResult) {
        message = pendingResultMessage({ pendingCount: pendingTotal, freeSlots: Number(data.freeSlots ?? 0), points })
      } else if (revealBadges.length === 0) {
        if (data.success && data.noReward === true) message = d.combine.noRewardResult
        else if (data.success) message = t(d.combine.successPointsOnly, { points })
        else message = data.message ?? d.combine.genericFail
      }

      setResult({
        success: !!data.success,
        badges: revealBadges,
        points,
        message,
        testMix: data.testMix === true,
        kind: 'mix',
        ...(pendingResult ? { pendingAfterClose: pendingTotal } : {}),
      })
      // 재료 소각·조합 결과 반영 — 슬롯만 비우고 같은 레시피 화면은 유지한다(오버레이를 닫을 때 처리).
      router.refresh()
    } catch {
      toast(d.combine.genericError, 'error')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 등급 올리기 제출 — 요청은 `{ itemIds, collectionId }` 둘뿐이다(확률과 결과는 서버가 정한다). 소각 앞의 거절은 모두 토스트로 알리고 결과 오버레이를
   * 열지 않으며 담은 칸을 그대로 둔다(`items_not_found`만 칸을 비운다). 고른 컬렉션으로는 받을 수 없다는 거절(`invalid_collection`·`no_candidate`)은
   * 컬렉션만 풀고 목록을 다시 읽는다. 분석 이벤트는 보내지 않는다 — `combine_attempt` 같은 레시피 믹스 지표를
   * 섞지 않기 위해서다(티켓 가정 나).
   */
  async function handleTierUp() {
    if (tierUpLoading || pendingBlocked || demoMode || !tierUpSubmitItemIds || !tierUpCollectionId) return
    const body: TierUpRequest = { itemIds: tierUpSubmitItemIds, collectionId: tierUpCollectionId }

    setTierUpLoading(true)
    setResult(null)
    try {
      const res = await fetch(TIER_UP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data || data.success !== true) {
        const rejection = tierUpRejection(res.status, data)
        toast(rejection.message, rejection.tone)
        if (rejection.clearSlots) setTierUpSlots(emptyTierUpSlots())
        if (rejection.clearCollection) setTierUpCollectionPick(null)
        if (rejection.refreshPending) await refreshPendingCount()
        if (rejection.refresh) router.refresh()
        return
      }

      const resultBadges = (data.resultBadges ?? []) as TierUpResultBadge[]
      if (data.resultStatus === 'pending') {
        // 빈칸이 모자라 받지 않은 결과로 남았다 — 카드 없이 기존 «받지 않은 믹스 결과» 문구를 쓴다(포인트는 없다). 닫으면 배너가 나타난다.
        const pendingTotal = Number(data.pendingCount ?? 0)
        setResult({
          success: true,
          badges: [],
          points: 0,
          message: pendingResultMessage({ pendingCount: pendingTotal, freeSlots: Number(data.freeSlots ?? 0), points: 0 }),
          kind: 'tierUp',
          pendingAfterClose: pendingTotal,
        })
      } else {
        const message = tierUpResultMessage(data.materialRarity, resultBadges)
        setResult({
          success: true,
          badges: toTierUpRevealBadges(resultBadges),
          points: 0,
          message,
          resultMessage: message,
          kind: 'tierUp',
        })
      }
      // 재료 소각·지급 반영 — 담은 칸은 오버레이를 닫을 때 비운다
      router.refresh()
    } catch {
      toast(d.combine.genericError, 'error')
    } finally {
      setTierUpLoading(false)
    }
  }

  function closeResult() {
    const testMixNotice = testMixNoticeOnClose(result)
    const closing = result
    setResult(null)
    if (demoMode) {
      // 온보딩 퀘스트 4~5단계 완료 — 같은 화면에 남지 않고 홈으로 이동한다(사용자 결정 3).
      router.push('/')
      return
    }
    // 티켓 요구사항: 오버레이를 닫으면 같은 레시피 화면에 슬롯만 비운 채로 남는다.
    // 받지 않은 결과를 받은 연출은 믹서의 채운 슬롯과 무관하므로 건드리지 않는다.
    if (closing?.kind === 'tierUp') setTierUpSlots(emptyTierUpSlots())
    else if (closing?.kind !== 'claim') setFills({})
    // 받지 않은 결과 개수가 바뀌었다 — 오버레이를 닫은 뒤에 배너를 나타내거나 지운다.
    if (closing?.pendingAfterClose !== undefined) {
      setPendingOverride(closing.pendingAfterClose)
      router.refresh()
    }
    // 시험 믹스 안내는 오버레이를 닫은 뒤에 띄운다 — 오버레이가 떠 있는 동안 토스트(z-60)가 올라오면
    // 같은 z의 캐러셀 하단 조작을 가로챌 수 있다(티켓 20261001_1159).
    if (testMixNotice) toast(testMixNotice, 'info')
  }

  function renderRecipeRow(recipe: RecipeWithSlots, onPick: (id: string) => void) {
    return (
      <RecipeRewardRow
        key={recipe.id}
        title={recipeDisplayName(recipe)}
        slotCount={recipe.slots.length}
        badges={recipe.rewardBadges}
        points={recipe.reward_points}
        releaseAt={recipe.releaseAt}
        noReward={isNoRewardRecipe(recipe)}
        rewardLocked={recipe.reward_locked === true}
        onClick={() => onPick(recipe.id)}
        className={pulseTarget?.type === 'recipe' ? 'jam-quest-pulse' : ''}
      />
    )
  }

  const bagSlot = selectedRecipe?.slots.find((s) => s.id === bagSlotId) ?? null
  const bagRows = bagSlot ? bagRowsFor(bagSlot) : []
  /** 아이템 슬롯이 있는 레시피에서만 재료 소각 안내를 보여준다(티켓 20260924_0813) */
  const hasItemSlot = selectedRecipe?.slots.some((s) => s.badge_type === 'item') ?? false
  /** 퀘스트 4~5단계 「지금 눌러야 할 요소」 펄스 — 판정은 computeQuestPulseTarget() 하나로 모은다.
   * 가방을 처음 열어 mix_fail을 기록하면 화면 새로고침 없이 같은 화면에서 5단계로 이어지므로
   * (상위 결정 23) 그때부터는 mix_success 규칙으로 판정한다(티켓 20260928_2155). */
  const pulseTarget = computeQuestPulseTarget({
    questStep: resolveQuestPulseStep(questStep, mixFailRecorded),
    loading,
    selectedRecipe,
    fills,
    bagSlotId,
    bagRows,
    canSubmit,
  })

  return (
    <div className="flex flex-col min-h-full text-foreground">
      {/*
        티켓 20260917_1655: /combine은 인벤토리 하위 화면이라 points와 동일한 뒤로가기형 TopNav를
        쓴다. 믹서 화면에서는 뒤로가기가 라우트를 벗어나지 않고 먼저 레시피 탐색으로
        돌아온다(closeMixer) — 라우트 이탈은 탐색 화면에서 한 번 더 눌러야 일어난다.
      */}
      <TopNav
        title={tierUpOpen ? d.combine.tierUp.title : d.combine.title}
        onBack={tierUpOpen ? closeTierUp : selectedRecipe ? closeMixer : undefined}
      />

      {/* 받지 않은 믹스 결과 배너 — 탐색·믹서 두 화면 모두 TopNav 바로 아래. 오류가 아니라 «할 일»이라 경고색을 쓰지 않는다(티켓 20261018_0055 2회). */}
      {pendingBlocked && (
        <div className="px-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl bg-surface px-4 py-4">
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
              <p className="m-0 text-base font-bold text-foreground break-keep wrap-break-word text-balance">
                {t(d.combine.pendingBanner.title, { count: pendingCount })}
              </p>
              <p className="m-0 text-sm text-muted break-keep wrap-break-word text-pretty">{d.combine.pendingBanner.body}</p>
            </div>
            <Button variant="primary" className="ml-auto whitespace-nowrap" onClick={openPendingSheet}>
              {d.combine.pendingBanner.action}
            </Button>
          </div>
        </div>
      )}

      {tierUpOpen ? (
        <TierUpPanel
          slots={tierUpFilled}
          noMaterials={tierUpGroups.length === 0}
          rarityNote={tierUpLockedRarity ? tierUpRarityNote(tierUpLockedRarity) : null}
          showNoEnoughNotice={!hasEnoughTierUpGroup(tierUpGroups)}
          canSubmit={!!tierUpSubmitItemIds && !!tierUpCollectionId}
          submitting={tierUpLoading}
          pendingBlocked={pendingBlocked}
          onOpenSheet={openTierUpSheet}
          onRemove={removeTierUpItem}
          onSubmit={handleTierUp}
          sheetOpen={tierUpSheetOpen}
          onCloseSheet={() => setTierUpSheetOpen(false)}
          sheet={tierUpSheet}
          onPick={pickTierUpItem}
          collection={tierUpCollectionView}
          collectionSheetOpen={tierUpCollectionSheetOpen && tierUpCollectionView.kind === 'ready'}
          onOpenCollectionSheet={openTierUpCollectionSheet}
          onCloseCollectionSheet={() => setTierUpCollectionSheetOpen(false)}
          onPickCollection={pickTierUpCollection}
          onRetryCollections={() => router.refresh()}
        />
      ) : !selectedRecipe ? (
        <>
          {/*
            등급 올리기 입구(티켓 20261022_2119 3회, 채원 판정) — 레시피가 아니라서 검색 결과에 걸리지 않게 검색창 위에 두고, 레시피 행의
            아이콘 칸과 슬롯 개수 원을 쓰지 않는다. 받지 않은 결과가 있어도 눌린다(막는 것은 제출 버튼뿐). 온보딩 연출 모드에서는
            레시피 하나만 보여야 하므로 그리지 않는다.
          */}
          {!demoMode && (
            <div className="px-4 pt-4">
              <ListRowCard onClick={openTierUp} trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--muted)]" />}>
                <p className="m-0 text-base text-foreground break-keep wrap-break-word">{d.combine.tierUp.title}</p>
                <p className="m-0 mt-0.5 text-sm text-muted break-keep wrap-break-word text-pretty">{d.combine.tierUp.entrySubtitle}</p>
              </ListRowCard>
            </div>
          )}

          {/* 검색 */}
          <div className="px-4 pt-4 pb-4">
            <div className="flex items-center gap-2 px-4 py-3 rounded-full bg-surface">
              <SearchIcon className="w-4 h-4 text-muted shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={d.combine.searchPlaceholder}
                className="flex-1 bg-transparent outline-none text-base text-foreground placeholder:text-muted"
              />
            </div>
          </div>

          {/* 레시피 탐색 목록 */}
          <div className="flex-1 px-4 pb-6">
            {publicRecipes.length === 0 ? (
              <EmptyState icon={<PackageIcon className="w-8 h-8" />} title={d.combine.noRecipes} />
            ) : filteredRecipes.length === 0 ? (
              <EmptyState icon={<SearchIcon className="w-8 h-8" />} title={d.combine.searchNoResult} />
            ) : (
              <div className="flex flex-col gap-2">
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
          <div className="px-4 pt-4 pb-4">
            <RecipeRewardRow
              title={recipeDisplayName(selectedRecipe)}
              slotCount={selectedRecipe.slots.length}
              badges={selectedRecipe.rewardBadges}
              points={selectedRecipe.reward_points}
              releaseAt={selectedRecipe.releaseAt}
              noReward={isNoRewardRecipe(selectedRecipe)}
              rewardLocked={selectedRecipe.reward_locked === true}
            />
          </div>

          {/* 레시피 설명 — 없으면 영역 자체를 그리지 않는다. 탐색 목록 행에는 싣지 않는다 */}
          {selectedRecipe.description?.trim() && (
            <RecipeDescription key={selectedRecipe.id} text={selectedRecipe.description} />
          )}

          {/* 믹서 슬롯 그리드 */}
          <div className="flex-1 px-4 pb-6">
            {/* 5칸은 3열(3+2)로 둔다 — 5열은 360px에서 칸이 약 59px라 썸네일과 이름이 읽히지 않는다. 4칸 이하는 지금처럼 4열 */}
            <div className={selectedRecipe.slots.length > 4 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-2'}>
              {selectedRecipe.slots.map((slot) => {
                const fill = fills[slot.id]
                const hasOwnedCandidate =
                  slot.badge_type === 'item'
                    ? slot.candidates.some((c) => (itemsByBadgeId.get(c.id) ?? []).length > 0)
                    : slot.candidates.some((c) => ownedConditionSet.has(c.id))
                const status: 'empty' | 'locked' | 'filled' = fill ? 'filled' : hasOwnedCandidate ? 'empty' : 'locked'

                const pulseSlot = pulseTarget?.type === 'slot' && pulseTarget.slotId === slot.id

                return (
                  <MixerSlot
                    key={slot.id}
                    status={status}
                    name={fill?.name}
                    imageUrl={fill?.imageUrl}
                    onClick={() => (fill ? undefined : openBagFor(slot))}
                    onRemove={fill ? () => removeSlot(slot.id) : undefined}
                    className={pulseSlot ? 'jam-quest-pulse' : ''}
                  />
                )
              })}
            </div>
          </div>

          {/* CTA — 화면 전체 폭을 채우지 않는다(티켓 20260917_1828, 요구사항 8) */}
          <div className="px-4 pb-6 flex flex-col items-center gap-2">
            <button
              onClick={handleCombine}
              disabled={loading || !canSubmit || pendingBlocked}
              aria-describedby={pendingBlocked ? 'combine-pending-note' : undefined}
              className={[
                'w-full max-w-[220px] py-4 rounded-full bg-foreground text-background text-base active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2',
                pulseTarget?.type === 'submit' ? 'jam-quest-pulse' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {loading && <span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />}
              {loading ? d.combine.combineButtonLoading : d.combine.combineButton}
            </button>
            {/* 새 믹스가 막힌 이유 — 말 없이 막지 않는다. 읽혀야 하는 정보라 muted가 아니라 foreground로 둔다 */}
            {pendingBlocked && (
              <p id="combine-pending-note" className="m-0 self-stretch text-sm text-foreground break-keep wrap-break-word text-pretty">
                {d.combine.pendingBlockedNote}
              </p>
            )}
            {/* 재료 소각 안내 — 아이템 슬롯이 있는 레시피에서만, 버튼 아래 상시 노출(티켓 20260924_0813) */}
            {hasItemSlot && (
              <p className="text-xs text-muted text-center">{d.combine.burnNotice}</p>
            )}
            {/* 시험 믹스 사전 안내 — 공개 전 레시피(운영자)에만. 조건형 문구라 화면이 낡아 공개 시각이 지나도 거짓이 되지 않는다(티켓 20261001_1159).
                360px에서 두 줄로 넘어가 마지막 글자 하나만 떨어지므로 단어 단위로 끊고 두 줄 길이를 맞춘다(break-keep·text-balance) */}
            {selectedRecipe.releaseAt && (
              <p className="text-xs text-muted text-center break-keep text-balance">{d.combine.testMixPreNotice}</p>
            )}
          </div>

          {/*
            가방 — 슬롯 하나를 지정해서 여는 시트. 빈 슬롯뿐 아니라 잠긴 슬롯을 탭해도 열리고,
            그 슬롯의 후보(slot.candidates) 전체를 보여준다(티켓 20260917_1655 개정) —
            슬롯 하나의 후보는 항상 같은 타입이라 타입 탭 구분은 없앴다.
          */}
          <BottomSheet open={!!bagSlot} onClose={() => setBagSlotId(null)} title={d.combine.bagTitle}>
            {/*
              여백은 앱 내 다른 BottomSheet 사용처와 동일하게 맞춘다
              (티켓 20260917_1828, 요구사항 4) — 이 시트만 좌우 패딩이 빠져 있었다.
            */}
            <div className="px-4 pt-2 pb-6">
              {bagRows.length === 0 ? (
                <EmptyState icon={<PackageIcon className="w-8 h-8" />} title={d.combine.bagEmpty} />
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {bagRows.map((row) => {
                    const active = row.state === 'active'
                    return (
                      <BagItemCell
                        key={row.key}
                        name={row.name}
                        imageUrl={row.imageUrl}
                        state={row.state}
                        pulse={pulseTarget?.type === 'bagRow' && pulseTarget.key === row.key}
                        onClick={() => bagSlot && active && fillSlot(bagSlot.id, row)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </BottomSheet>
        </>
      )}

      {/* 받지 않은 믹스 결과 받기 시트 — 탐색·믹서 어느 화면에서든 배너의 «받기»로 연다 */}
      <PendingResultsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        view={sheet}
        onClaim={handleClaim}
        onRetry={loadPending}
      />

      {/* 결과 오버레이 — 성공 시 BadgeRevealCarousel, 실패(또는 배지 없이 포인트만)는 같은 셸에 메시지 */}
      <BadgeRevealOverlay
        open={!!result}
        items={result?.badges ?? []}
        profileHref="/profile"
        onClose={closeResult}
        emptyMessage={result?.message}
        resultMessage={result?.resultMessage}
      />
    </div>
  )
}
