/**
 * 계열(family) 단위 배지 관리의 순수 로직 (티켓 20260905_0032 B-1)
 *
 * ## 왜 필요한가
 * 어드민에는 「계열」 개념이 없어서 **배지 1개당 폼 1개**를 열어 등록해야 한다. 현재
 * 활동 배지 207종 = 87계열인데 v5는 164계열 550종이라 그 방식으로는 관리가 불가능하다.
 *
 * ## 이 파일에 두는 것 / 두지 않는 것
 * React·Supabase에 의존하지 않는 «판정과 조립»만 둔다 — 계열 그룹핑 · 계열 키 발급 규칙 ·
 * 다음 레벨 초안 · 일괄 재계산 계획과 확인 토큰. 화면(`app/admin/badge-families/**`)과
 * API(`app/api/admin/badge-families/**`)가 **같은 함수**를 부른다. 조건 필드 메타는
 * `conditionRegistry.ts`가, 배지 종류 판정은 `badgeKind.ts`가 이미 갖고 있으므로
 * 여기서 다시 선언하지 않는다.
 *
 * ## ⚠️ `family_key`는 발급 후 불변이다 (2026-09-05 사용자 확정, 티켓 판단 ③)
 * 2단 교차 게이트가 대상 계열을 `family_key`로 지정하므로(`crossGate.ts`), 이름을 고쳐도
 * 키가 바뀌면 **게이트 참조가 조용히 끊긴다.** 이 파일은 「비어 있으면 발급」만 허용하고
 * 「이미 있는 키를 바꾸기」는 `findFamilyKeyIssueError`가 막는다.
 */
import type { ActivityType, BadgeCondition, BadgeRarity, BadgeRow } from '@/types/database'
import { familyKeyOf, isLeveledBadge } from '@/lib/badge-engine/badgeKind'
import {
  MEASURABLE_CONDITION_KEYS,
  findBlockingConditionKeys,
  getConditionField,
  type AnyConditionFieldMeta,
  type ConditionKey,
} from '@/lib/badge-engine/conditionRegistry'
import { RARITY_LABEL, RARITY_TIER } from '@/lib/rarity'
// 「sort_order = 0은 맨 뒤」는 배지 트리와 같은 규칙을 써야 한다 — 다시 선언하지 않는다.
import { sortRank, TREE_ACTIVITY_ORDER } from '@/lib/badgeTree'

/** 계열 화면이 다루는 배지 한 건. 목록·상세·초안 조립에 필요한 컬럼만 받는다 */
export type FamilyBadge = Pick<
  BadgeRow,
  | 'id'
  | 'name'
  | 'description'
  | 'rarity'
  | 'level'
  | 'family_key'
  | 'sort_order'
  | 'image_url'
  | 'condition_json'
  | 'activity_types'
  | 'deleted_at'
>

/** 계열 안 배지들의 종류 구성. `mixed`는 카탈로그 오류 신호다(같은 키에 등급형·레벨형 혼재) */
export type FamilyKind = 'graded' | 'leveled' | 'mixed'

export interface BadgeFamily {
  /**
   * 그룹핑 키 — **`familyKeyOf`와 같은 규칙이다.** `family_key`가 정본이고 비어 있을 때만
   * `#name:` 폴백으로 묶는다. 엔진(`index.ts`·`crossGate.ts`)·싱크(`sync.ts`)가 이미 이
   * 함수로 계열을 묶으므로 어드민이 다른 기준으로 묶으면 화면과 발급이 어긋난다.
   */
  key: string
  /** 실제 발급된 `badges.family_key`. null이면 폴백으로 묶인 «키 없는 계열»이다 */
  familyKey: string | null
  /** 계열 이름 — 첫 배지의 이름. 표시용이며 계열 정체성은 `familyKey`가 갖는다 */
  name: string
  activityType: ActivityType | null
  kind: FamilyKind
  /** 레벨 오름차순(레벨형) / 등급 오름차순(등급형)으로 정렬된 구성 배지 */
  variants: FamilyBadge[]
  /** 현재 최고 레벨/등급 표시 문구 */
  topLabel: string
  /** 사용 중인 측정 조건 지표(계열 전체의 합집합) */
  measurableKeys: ConditionKey[]
  /** 그중 엔진이 아직 평가하지 않는 필드 — 「평가 대기」 표시용 */
  pendingKeys: ConditionKey[]
  /** 이미지가 있는 배지 수 */
  withImage: number
  /** 표시 순서 — 계열 안 최솟값(`sortRank`, 0은 맨 뒤) */
  sortOrder: number
  /** 미션 보상 배지가 섞여 있는가 — 계열 그룹핑·발급 판정 대상이 아니다 */
  missionReward: boolean
}

/** 등급 오름차순 — `RARITY_TIER`가 유일한 등급 순서 정의다 */
function variantRank(badge: FamilyBadge): number {
  if (badge.level != null) return badge.level
  return badge.rarity ? RARITY_TIER[badge.rarity] : 0
}

/** 「Lv.3」·「Epic」처럼 계열 안 위치를 가리키는 라벨 */
export function slotLabelOf(badge: Pick<FamilyBadge, 'rarity' | 'level'>): string {
  if (badge.level != null) return `Lv.${badge.level}`
  return badge.rarity ? RARITY_LABEL[badge.rarity] : '—'
}

/** 조건에 실제로 들어 있는 «수치» 측정 지표 키 (문자열·객체 값은 증감 대상이 아니다) */
export function numericAxisKeysOf(condition: BadgeCondition | null | undefined): ConditionKey[] {
  if (!condition) return []
  return MEASURABLE_CONDITION_KEYS.filter((key) => typeof condition[key] === 'number')
}

/**
 * 활동 배지 목록을 계열로 묶는다. **그룹핑 키는 `familyKeyOf`다** — `family_key`가 정본이고
 * 비어 있을 때만 이름 폴백(`#name:`)으로 묶인다.
 */
export function groupBadgesIntoFamilies(badges: FamilyBadge[]): BadgeFamily[] {
  const groups = new Map<string, FamilyBadge[]>()
  for (const badge of badges) {
    const key = familyKeyOf(badge)
    const bucket = groups.get(key)
    if (bucket) bucket.push(badge)
    else groups.set(key, [badge])
  }

  const families: BadgeFamily[] = []
  for (const [key, rawVariants] of groups) {
    const variants = [...rawVariants].sort(
      (a, b) => variantRank(a) - variantRank(b) || a.name.localeCompare(b.name, 'ko')
    )
    const leveled = variants.filter((v) => isLeveledBadge(v)).length
    const kind: FamilyKind = leveled === 0 ? 'graded' : leveled === variants.length ? 'leveled' : 'mixed'

    const measurable = new Set<ConditionKey>()
    const pending = new Set<ConditionKey>()
    for (const v of variants) {
      for (const k of MEASURABLE_CONDITION_KEYS) {
        if (v.condition_json?.[k] !== undefined) measurable.add(k)
      }
      // `pending`은 `string[]`이다 — 레지스트리에 없는 키(오탈자)까지 담을 수 있는 자리라
      // 좁은 타입을 쓰지 않는다. 여기 들어오는 값은 레지스트리 선언에서 나온 키뿐이다.
      for (const k of findBlockingConditionKeys(v.condition_json ?? null).pending) {
        pending.add(k as ConditionKey)
      }
    }

    const top = variants[variants.length - 1]
    families.push({
      key,
      familyKey: variants.find((v) => v.family_key)?.family_key ?? null,
      name: variants[0].name,
      activityType: variants[0].activity_types?.[0] ?? null,
      kind,
      variants,
      topLabel:
        kind === 'mixed'
          ? variants.map(slotLabelOf).join(' · ')
          : slotLabelOf(top),
      measurableKeys: [...measurable],
      pendingKeys: [...pending],
      withImage: variants.filter((v) => !!v.image_url).length,
      sortOrder: Math.min(...variants.map((v) => sortRank(v.sort_order))),
      missionReward: variants.some((v) => v.condition_json?.mission_reward === true),
    })
  }

  return families.sort(compareFamilies)
}

/** 종목 탭 순서 → 표시 순서(0은 맨 뒤) → 이름. 배지 트리 화면과 같은 기준이다 */
export function compareFamilies(a: BadgeFamily, b: BadgeFamily): number {
  const rank = (t: ActivityType | null) => {
    const i = t ? TREE_ACTIVITY_ORDER.indexOf(t) : -1
    return i < 0 ? TREE_ACTIVITY_ORDER.length : i
  }
  return (
    rank(a.activityType) - rank(b.activityType) ||
    a.sortOrder - b.sortOrder ||
    a.name.localeCompare(b.name, 'ko')
  )
}

// ── 계열 키 발급 ────────────────────────────────────────────────────────────

/**
 * 계열 키 슬러그. 어드민이 **교차 게이트에 손으로 적어야 하므로 읽을 수 있어야 한다**
 * (티켓 판단 ③, 예: `walking:night-walker`). 한글 이름은 한글을 그대로 남긴다 —
 * 로마자 변환은 사람이 알아보기 더 어렵다.
 *
 * 쉼표를 반드시 지운다: 조건 폼의 교차 게이트 입력이 **쉼표 구분 목록**이라(BadgeForm)
 * 키에 쉼표가 들어가면 그 게이트를 손으로 적을 수 없다.
 */
export function familyKeySlug(name: string): string {
  return name
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** `{활동종목}:{슬러그}` — 마이그레이션 130이 기존 207종에 구운 형태와 같은 모양이다 */
export function buildFamilyKey(activityType: string, name: string): string {
  return `${activityType}:${familyKeySlug(name)}`
}

/**
 * 키로 쓸 수 있는 형태인가. **관대하게 본다** — 기존 207종의 키는 마이그레이션 130이
 * `"{activity_type}:{name}"`으로 구워 공백이 든 한글이 그대로 들어 있고(`walking:밤의 보행자`),
 * 그 키를 교차 게이트가 이미 가리키고 있을 수 있다. 여기서 막아야 하는 것은 «게이트에
 * 적을 수 없게 되는 형태»뿐이다.
 */
export function isValidFamilyKey(key: string): boolean {
  if (!key || key !== key.trim()) return false
  if (key.includes(',')) return false // 교차 게이트 입력이 쉼표 구분 목록이다
  if (key.startsWith('#')) return false // `#name:`은 `familyKeyOf`의 폴백 접두어 전용
  return key.includes(':')
}

/**
 * 계열 키 «발급»을 막아야 하는 이유를 돌려준다. 없으면 null.
 *
 * **이미 키가 있는 배지는 언제나 거부한다** — 같은 값을 다시 쓰는 것도 막는다. 「발급」과
 * 「변경」을 한 경로에 두면 언젠가 변경이 새어 들어오고, 그 순간 교차 게이트 참조가
 * 조용히 끊긴다(티켓 판단 ③).
 */
export function findFamilyKeyIssueError(
  badge: Pick<BadgeRow, 'name' | 'type' | 'family_key' | 'activity_types'>,
  requestedKey: string
): string | null {
  if (badge.family_key) {
    return `발급할 수 없습니다. "${badge.name}"에는 이미 계열 키(${badge.family_key})가 있습니다. 교차 게이트가 이 키로 계열을 가리키므로 발급된 키는 바꿀 수 없습니다.`
  }
  if (badge.type !== 'activity') {
    return `발급할 수 없습니다. 계열 키는 활동 배지에만 발급합니다("${badge.name}"의 타입: ${badge.type}).`
  }
  if (!isValidFamilyKey(requestedKey)) {
    return `발급할 수 없습니다. 계열 키 형태(${requestedKey || '비어 있음'})가 올바르지 않습니다. "종목:이름" 형태로, 쉼표 없이 입력해주세요.`
  }
  return null
}

/**
 * 이 계열에 발급할 키를 정한다.
 *
 * **형제가 이미 키를 갖고 있으면 그 키를 그대로 쓴다** — 키 없는 배지에 새 키를 만들어
 * 붙이면 같은 계열이 둘로 쪼개진다. 형제도 없으면 종목·이름에서 새로 만든다.
 */
export function proposeFamilyKey(family: BadgeFamily): string | null {
  if (family.familyKey) return family.familyKey
  if (!family.activityType) return null
  const slug = familyKeySlug(family.name)
  if (!slug) return null
  return buildFamilyKey(family.activityType, slug)
}

// ── 다음 레벨 초안 ──────────────────────────────────────────────────────────

/** 임계값 증가 규칙 */
export const LEVEL_STEP_RULES = ['arithmetic', 'geometric', 'manual'] as const
export type LevelStepRule = (typeof LEVEL_STEP_RULES)[number]

export const LEVEL_STEP_RULE_LABEL: Record<LevelStepRule, string> = {
  arithmetic: '등차 — 직전 값에 증가량을 더해요',
  geometric: '등비 — 직전 값에 배율을 곱해요',
  manual: '수동 — 직전 값을 그대로 두고 직접 고쳐요',
}

/** 계열의 다음 자리. 등급형은 다음 등급, 레벨형은 다음 레벨. Mystic까지 다 찼으면 null */
export type FamilySlot =
  | { kind: 'level'; level: number; rarity: null; label: string }
  | { kind: 'rarity'; level: null; rarity: BadgeRarity; label: string }

const RARITY_ASC: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

export function nextFamilySlot(family: BadgeFamily): FamilySlot | null {
  if (family.kind === 'leveled') {
    const maxLevel = Math.max(0, ...family.variants.map((v) => v.level ?? 0))
    return { kind: 'level', level: maxLevel + 1, rarity: null, label: `Lv.${maxLevel + 1}` }
  }
  if (family.kind === 'graded') {
    // **가장 높은 자리의 «바로 위»**를 제안한다. 「빈 자리 중 가장 낮은 것」이 아니다.
    //
    // 초안은 빈 자리 중 가장 낮은 등급을 골랐는데, 조건 축은 `buildNextLevelDraft`가
    // **가장 높은 자리**에서 상속하고 증가 규칙을 «위 방향»으로 적용한다. 그래서 Mystic
    // 하나뿐인 계열에서 Common을 제안하면 **Mystic보다 임계값이 더 큰 Common 초안**이 나온다
    // — 증가 방향이 뒤집힌다(게이트 리뷰 지적). 실측(2026-09-05): 87계열 중 **36계열(41%)**이
    // 「자리 1개 + 등급이 common이 아님」이라 이 형태에 해당한다.
    //
    // 「자리 추가」의 뜻은 «계열을 위로 잇는다»이므로 상속 방향과 제안 방향을 일치시킨다.
    // 최고 자리가 이미 Mystic이면 더 얹을 곳이 없어 null이다(버튼 비활성).
    // 중간에 빈 등급이 있는 계열(예: Rare·Mystic만 존재)의 구멍 메우기는 이 기능이 아니라
    // 기존 배지 폼의 몫이다 — 상속 없이 임의 등급을 만드는 일이라 규칙이 다르다.
    const highest = family.variants[family.variants.length - 1]?.rarity ?? null
    if (!highest) return null
    const next = RARITY_ASC[RARITY_ASC.indexOf(highest) + 1]
    if (!next) return null
    return { kind: 'rarity', level: null, rarity: next, label: RARITY_LABEL[next] }
  }
  // mixed는 카탈로그 오류 상태다 — 어느 쪽 레일에 붙일지 판단할 근거가 없다
  return null
}

/** 축 하나의 «직전 값 → 다음 값» */
export interface AxisStep {
  key: ConditionKey
  label: string
  unit: string | null
  before: number
  after: number
}

export interface NextLevelDraft {
  slot: FamilySlot
  name: string
  description: string
  image_url: string | null
  activity_types: ActivityType[]
  family_key: string | null
  sort_order: number
  level: number | null
  rarity: BadgeRarity | null
  /** 상속한 조건 — 축 값만 규칙대로 옮긴 나머지 전부(필터·게이트 포함)를 그대로 물려받는다 */
  condition_json: BadgeCondition
  axes: AxisStep[]
  /** 직전 두 자리에서 증가 폭을 유추했는가. false면 화면 입력값(amount)만으로 계산했다 */
  inferred: boolean
}

/** 조건 필드 메타의 범위·정밀도에 맞춰 값을 다듬는다 */
export function roundAxisValue(key: ConditionKey, value: number): number {
  const meta: AnyConditionFieldMeta | undefined = getConditionField(key)
  let out = value
  if (!Number.isFinite(out)) return 0
  if (meta?.input === 'integer') out = Math.round(out)
  else {
    const step = meta?.step ?? 0.1
    const decimals = step >= 1 ? 0 : Math.min(3, String(step).split('.')[1]?.length ?? 1)
    out = Number(out.toFixed(decimals))
  }
  if (meta?.min !== undefined) out = Math.max(meta.min, out)
  if (meta?.max !== undefined) out = Math.min(meta.max, out)
  return out
}

/**
 * 값이 커질수록 어려워지는 축인가. `max_pace_sec_per_km`처럼 **작을수록 어려운** 축은
 * 증가 규칙의 부호를 뒤집어야 한다 — 그대로 더하면 다음 레벨이 오히려 쉬워진다.
 */
function isHigherHarder(key: ConditionKey): boolean {
  return getConditionField(key)?.direction !== 'lower'
}

function stepValue(key: ConditionKey, before: number, rule: LevelStepRule, amount: number): number {
  if (rule === 'manual') return before
  const harder = isHigherHarder(key)
  if (rule === 'arithmetic') return before + (harder ? amount : -amount)
  if (amount <= 0) return before
  return harder ? before * amount : before / amount
}

/**
 * 다음 레벨(또는 다음 등급) 초안을 만든다 — **조건 축·이미지·설명을 상속한다.**
 *
 * 상속 범위는 «가장 높은 자리»의 배지다. `condition_json`은 통째로 복사한 뒤 수치 축만
 * 규칙대로 옮긴다 — 활동 종목·시간대·교차 게이트 같은 필터를 빠뜨리면 다음 레벨이 다른
 * 조건의 배지가 되어버린다.
 *
 * 증가 폭(`amount`)을 넘기지 않으면 **직전 두 자리에서 유추한다**(등차: 차, 등비: 비).
 */
export function buildNextLevelDraft(
  family: BadgeFamily,
  options: { rule: LevelStepRule; amount?: number }
): NextLevelDraft | null {
  const slot = nextFamilySlot(family)
  if (!slot || family.variants.length === 0) return null

  const source = family.variants[family.variants.length - 1]
  const previous = family.variants.length >= 2 ? family.variants[family.variants.length - 2] : null
  const condition: BadgeCondition = { ...(source.condition_json ?? {}) }

  const axes: AxisStep[] = []
  let inferred = false
  for (const key of numericAxisKeysOf(source.condition_json)) {
    const before = source.condition_json![key] as number
    const prev = previous?.condition_json?.[key]
    let amount = options.amount
    if (amount === undefined && typeof prev === 'number' && prev !== 0) {
      // 유추값은 부호를 이미 갖고 있다 — `stepValue`가 방향으로 다시 뒤집지 않도록
      // 절댓값으로 넘긴다(작을수록 어려운 축은 그 안에서 부호가 뒤집힌다).
      amount = options.rule === 'geometric' ? Math.abs(before / prev) : Math.abs(before - prev)
      inferred = true
    }
    const after = roundAxisValue(key, stepValue(key, before, options.rule, amount ?? (options.rule === 'geometric' ? 1 : 0)))
    ;(condition as Record<string, unknown>)[key] = after
    const meta = getConditionField(key)
    axes.push({ key, label: meta?.label ?? key, unit: meta?.unit ?? null, before, after })
  }

  return {
    slot,
    name: source.name,
    description: source.description,
    image_url: source.image_url,
    activity_types: source.activity_types ?? [],
    // 새 자리는 같은 계열이다 — 키가 없으면 물려줄 것도 없다(먼저 발급해야 한다).
    family_key: family.familyKey,
    // ⚠️ `sort_order`를 물려주지 않으면 0(미설정)이 되어 **배지 트리에서 계열과 떨어져
    //    맨 뒤로 밀린다.** 이 저장소의 다른 `sort_order`와 반대 관습이다(마이그레이션 130).
    sort_order: family.sortOrder === Number.MAX_SAFE_INTEGER ? 0 : family.sortOrder,
    level: slot.level,
    rarity: slot.rarity,
    condition_json: condition,
    axes,
    inferred,
  }
}

// ── 일괄 재계산 ────────────────────────────────────────────────────────────

export interface RecalculationSpec {
  /** 다시 계산할 축 하나 */
  axis: ConditionKey
  rule: LevelStepRule
  /** 첫 자리(Lv.1 / Common)의 값 */
  base: number
  /** 등차의 증가량 · 등비의 배율. `manual`이면 무시된다 */
  amount: number
  /** `manual` 전용 — 계열 정렬 순서대로의 값. 빈 칸(null)은 «그대로 둔다» */
  manualValues?: (number | null)[]
}

export interface RecalculationChange {
  badgeId: string
  slotLabel: string
  before: number
  after: number
  changed: boolean
}

export interface RecalculationSkip {
  badgeId: string
  slotLabel: string
  reason: string
}

export interface RecalculationPlan {
  familyKey: string
  axis: ConditionKey
  axisLabel: string
  rule: LevelStepRule
  changes: RecalculationChange[]
  skipped: RecalculationSkip[]
  /**
   * 이 계획을 **눈으로 본 사람만** 커밋할 수 있게 하는 확인 토큰.
   * 계획의 내용(대상 배지·현재값·새 값)에서 계산하므로, 계획을 본 뒤 DB가 바뀌면
   * 토큰이 달라져 커밋이 거부된다.
   */
  token: string
}

/**
 * 일괄 재계산 «계획»을 만든다 — **여기서는 아무것도 쓰지 않는다.**
 * 쓰기는 계획의 토큰을 되돌려받은 커밋 단계에서만 일어난다(`findRecalculationConfirmError`).
 *
 * 축이 없는 배지는 **건너뛴다.** 없는 축을 새로 넣으면 계열 안 측정 필드 조합이 달라져
 * `badges_family_consistency` 트리거가 통째로 EXCEPTION을 낸다(마이그레이션 128/134).
 */
export function buildRecalculationPlan(family: BadgeFamily, spec: RecalculationSpec): RecalculationPlan {
  const changes: RecalculationChange[] = []
  const skipped: RecalculationSkip[] = []

  family.variants.forEach((variant, index) => {
    const slotLabel = slotLabelOf(variant)
    const before = variant.condition_json?.[spec.axis]
    if (typeof before !== 'number') {
      skipped.push({
        badgeId: variant.id,
        slotLabel,
        reason: '이 배지에는 해당 지표가 없어요. 없는 지표를 새로 넣으면 계열 조건 조합이 어긋나 저장이 막혀요.',
      })
      return
    }

    let after: number
    if (spec.rule === 'manual') {
      const manual = spec.manualValues?.[index]
      if (manual === null || manual === undefined || !Number.isFinite(manual)) after = before
      else after = roundAxisValue(spec.axis, manual)
    } else {
      const harder = isHigherHarder(spec.axis)
      const raw =
        spec.rule === 'arithmetic'
          ? spec.base + (harder ? spec.amount : -spec.amount) * index
          : harder
            ? spec.base * Math.pow(spec.amount, index)
            : spec.base / Math.pow(spec.amount || 1, index)
      after = roundAxisValue(spec.axis, raw)
    }

    changes.push({ badgeId: variant.id, slotLabel, before, after, changed: after !== before })
  })

  const plan: Omit<RecalculationPlan, 'token'> = {
    familyKey: family.key,
    axis: spec.axis,
    axisLabel: getConditionField(spec.axis)?.label ?? spec.axis,
    rule: spec.rule,
    changes,
    skipped,
  }
  return { ...plan, token: recalculationPlanToken(plan) }
}

/**
 * 계획 → 확인 토큰. 계획의 «대상·현재값·새 값»만으로 계산한다.
 *
 * `node:crypto`를 쓰지 않는 이유: 이 파일은 어드민 화면(클라이언트 컴포넌트)도 import한다.
 * 토큰은 비밀이 아니라 **「이 계획을 봤다」는 표식**이라 충돌 저항성만 있으면 된다.
 */
export function recalculationPlanToken(plan: Omit<RecalculationPlan, 'token'>): string {
  const canonical = JSON.stringify([
    plan.familyKey,
    plan.axis,
    plan.rule,
    plan.changes.map((c) => [c.badgeId, c.before, c.after]),
    plan.skipped.map((s) => s.badgeId),
  ])
  return `${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x01000193)}`
}

function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 커밋을 막아야 하는 이유를 돌려준다. 없으면 null.
 *
 * **확인 없이는 쓰지 않는다**(티켓 B-1). 토큰이 없으면 diff를 보지 않은 것이고, 토큰이
 * 다르면 diff를 본 뒤 계열이 바뀐 것이다 — 둘 다 그대로 쓰면 안 된다.
 */
export function findRecalculationConfirmError(plan: RecalculationPlan, token: unknown): string | null {
  if (typeof token !== 'string' || token.length === 0) {
    return '적용할 수 없습니다. 변경 전후를 먼저 확인해주세요.'
  }
  if (token !== plan.token) {
    return '적용할 수 없습니다. 확인한 뒤 계열이 바뀌었습니다. 변경 전후를 다시 확인해주세요.'
  }
  if (plan.changes.every((c) => !c.changed)) {
    return '적용할 것이 없습니다. 바뀌는 값이 없습니다.'
  }
  return null
}

/** 축 하나만 바꾼 새 조건 객체 — 원본을 건드리지 않는다 */
export function applyAxisValue(
  condition: BadgeCondition | null,
  axis: ConditionKey,
  value: number
): BadgeCondition {
  return { ...(condition ?? {}), [axis]: value }
}
