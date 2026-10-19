/**
 * 미션 보상 배지 검증과 숨김 배지 사용처 조회 (티켓 20261019_1313 2회, 티켓 20261019_0012 흡수)
 *
 * 숨김 배지(`badges.is_hidden`)는 받기 전에는 이름·그림·개수 어디에도 내려가면 안 된다(운영 로직 10.3절). 그런데 미션 보상은
 * 받기 전에 화면에 보이므로, 숨김 배지를 미션 보상으로 저장하지 못하게 서버가 먼저 막는다. 이 파일이 그 판정의 단일 출처다.
 *
 *  - 보상 배지 저장 검증: 존재(삭제 제외)·유형(액티비티·아이템만, 체크인 거절)·숨김 거절·중복 제거.
 *    어드민 미션 POST·PATCH, 운영툴 예약 등록의 사전 확인(`registerChecks/mission.ts`), 등록 스크립트가 같은 판정(`judgeRewardBadgeRows`)을 쓴다.
 *  - 사용처 조회: 이미 미션 보상·게이트 미션 배지·선행 배지·교차 게이트로 쓰이는 배지를 숨김으로 바꾸는 저장을 막는 데 쓴다.
 *  - 노출 가림: 화면용 미션 행에서 숨김 보상 배지 id를 뺀다(`withoutHiddenRewardBadgeIds`).
 *
 * 서버 전용 의존이 없다(`condition-keys.ts`와 같은 규칙): Supabase는 타입만 가져오고, 클라이언트는 호출부가 넘긴다.
 * 어드민 폼(클라이언트 컴포넌트)이 이 파일의 순수 함수를 가져와도 서버 모듈이 끌려오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CROSS_GATE_CONDITION_KEYS } from '@/lib/badge-engine/crossGate'
import { familyKeyOf } from '@/lib/badge-engine/badgeKind'
import type { BadgeCondition } from '@/types/database'

/** 미션 보상으로 줄 수 있는 배지 유형. 체크인 배지는 보상이 아니다(운영 로직 13.2절 «보상은 액티비티 배지, 포인트, 아이템 배지») */
export const MISSION_REWARD_BADGE_TYPES = ['activity', 'item'] as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 저장을 막을 때 라우트가 그대로 응답에 쓰는 모양. 400은 입력 문제, 500은 확인하지 못한 경우다 */
export interface SaveBlock {
  status: 400 | 500
  error: string
}

/** 검증이 읽는 배지 한 건 */
export interface RewardBadgeRow {
  id: string
  name?: string | null
  type?: string | null
  is_hidden?: boolean | null
}

const TYPE_LABEL: Record<string, string> = { activity: '액티비티 배지', item: '아이템 배지', checkin: '체크인 배지' }

/** 문구에 쓰는 배지 유형 이름. 비어 있으면(읽지 못한 경우) 유형을 모른다고 알린다 */
function typeLabel(type: string): string {
  if (type === '') return '유형을 알 수 없는 배지'
  return TYPE_LABEL[type] ?? type
}

const READ_FAILED_MESSAGE = '저장하지 못했어요. 서버에서 배지를 확인하다가 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

/** 이름 목록을 문장에 넣을 모양으로 줄인다. 3개를 넘으면 «외 N개» */
function listNames(names: readonly string[], max = 3): string {
  const unique = [...new Set(names)]
  const shown = unique.slice(0, max).map((name) => `「${name}」`).join(', ')
  return unique.length > max ? `${shown} 외 ${unique.length - max}개` : shown
}

/**
 * 요청의 `reward_badge_ids`를 저장할 모양으로 바꾼다: 중복을 없애고 소문자 UUID로 맞춘다.
 *  - `undefined`·`null`: 보내지 않은 것이라 `ids: null`(저장 값을 건드리지 않는다).
 *  - 배열이 아니거나 UUID가 아닌 값이 섞여 있으면 거절한다. 그대로 질의하면 DB가 형식 오류 원문을 돌려준다.
 */
export function parseRewardBadgeIds(raw: unknown): { ok: true; ids: string[] | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, ids: null }
  if (!Array.isArray(raw)) {
    return { ok: false, error: '저장할 수 없습니다. 보상 배지 목록의 형식이 올바르지 않아요. 화면을 새로고침한 뒤 배지를 다시 골라 주세요.' }
  }
  const bad = raw.filter((value) => typeof value !== 'string' || !UUID_PATTERN.test(value))
  if (bad.length > 0) {
    return {
      ok: false,
      error: `저장할 수 없습니다. 보상 배지 id의 형식이 올바르지 않아요(${bad.map(String).join(', ')}). 배지를 검색해서 다시 골라 주세요.`,
    }
  }
  const ids = [...new Set((raw as string[]).map((id) => id.toLowerCase()))]
  return { ok: true, ids }
}

/**
 * 읽어 온 배지 행으로 보상 배지 목록을 판정한다. 통과하면 `null`, 막으면 현상·원인·해결책 문구.
 * `rows`는 삭제되지 않은 배지만 담아 온 것이라, 목록에 없는 id는 «없거나 삭제된 배지»다.
 * 한 번에 하나씩 알린다: 없음 → 유형 → 숨김 순서.
 */
export function judgeRewardBadgeRows(ids: readonly string[], rows: readonly RewardBadgeRow[]): string | null {
  const byId = new Map(rows.map((row) => [String(row.id).toLowerCase(), row]))

  const missing = ids.filter((id) => !byId.has(id.toLowerCase()))
  if (missing.length > 0) {
    return `저장할 수 없습니다. 보상 배지를 찾을 수 없어요(${missing.join(', ')}). 없거나 삭제된 배지예요. 배지를 다시 검색해서 골라 주세요.`
  }

  const picked = ids.map((id) => byId.get(id.toLowerCase())!)

  const wrongType = picked.filter((row) => !(MISSION_REWARD_BADGE_TYPES as readonly string[]).includes(String(row.type)))
  if (wrongType.length > 0) {
    const kinds = [...new Set(wrongType.map((row) => row.type ?? ''))]
    const detail = kinds
      .map((kind) => `${typeLabel(kind)}: ${listNames(wrongType.filter((row) => (row.type ?? '') === kind).map((row) => row.name ?? row.id))}`)
      .join(' / ')
    return `저장할 수 없습니다. 미션 보상으로 쓸 수 없는 배지가 있어요(${detail}). 미션 보상은 액티비티 배지나 아이템 배지만 줄 수 있어요. 액티비티 또는 아이템 배지로 바꿔 주세요.`
  }

  const hidden = picked.filter((row) => row.is_hidden === true)
  if (hidden.length > 0) {
    return `저장할 수 없습니다. 미션 보상으로 쓸 수 없는 숨김 배지가 있어요(${listNames(hidden.map((row) => row.name ?? row.id))}). 숨김 배지는 받기 전에 이름이 보이면 안 되는데, 미션 보상은 받기 전에 화면에 보여요. 숨김이 아닌 배지로 바꿔 주세요.`
  }
  return null
}

/**
 * 어드민 미션 저장 라우트용 보상 배지 검증. `raw`는 요청 본문의 `reward_badge_ids`다.
 * 통과하면 저장할 id 목록(중복 제거)을 돌려준다. 보내지 않았으면 `ids: null`이라 호출부가 본문을 그대로 둔다.
 * 읽기에 실패하면 통과시키지 않는다(숨김 배지가 새는 쪽이 더 나쁘다).
 */
export async function validateMissionRewardBadges(
  supabase: SupabaseClient,
  raw: unknown
): Promise<({ ok: true; ids: string[] | null }) | ({ ok: false } & SaveBlock)> {
  const parsed = parseRewardBadgeIds(raw)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  if (parsed.ids === null || parsed.ids.length === 0) return { ok: true, ids: parsed.ids }

  const { data, error } = await supabase
    .from('badges')
    .select('id, name, type, is_hidden')
    .in('id', parsed.ids)
    .is('deleted_at', null)
  if (error) {
    console.error('[validateMissionRewardBadges] 보상 배지 조회 오류:', error)
    return { ok: false, status: 500, error: READ_FAILED_MESSAGE }
  }
  const blocked = judgeRewardBadgeRows(parsed.ids, (data ?? []) as RewardBadgeRow[])
  if (blocked) return { ok: false, status: 400, error: blocked }
  return { ok: true, ids: parsed.ids }
}

/**
 * 게이트 미션 배지(`missions.gated_badge_id`, 이 미션을 완료해야 열리는 본 배지)가 숨김이 아닌지 본다.
 * 비어 있으면(null·빈 문자열·보내지 않음) 통과다. 없는 배지는 여기서 막지 않는다(FK가 지킨다).
 */
export async function validateGatedBadge(
  supabase: SupabaseClient,
  raw: unknown
): Promise<({ ok: true }) | ({ ok: false } & SaveBlock)> {
  if (typeof raw !== 'string' || raw === '') return { ok: true }
  if (!UUID_PATTERN.test(raw)) {
    return { ok: false, status: 400, error: `저장할 수 없습니다. 게이트 배지 id의 형식이 올바르지 않아요(${raw}). 배지를 검색해서 다시 골라 주세요.` }
  }
  const { data, error } = await supabase.from('badges').select('id, name, is_hidden').eq('id', raw).maybeSingle()
  if (error) {
    console.error('[validateGatedBadge] 게이트 배지 조회 오류:', error)
    return { ok: false, status: 500, error: READ_FAILED_MESSAGE }
  }
  if ((data as RewardBadgeRow | null)?.is_hidden === true) {
    return {
      ok: false,
      status: 400,
      error: `저장할 수 없습니다. 게이트 배지로 쓸 수 없는 숨김 배지예요(「${(data as RewardBadgeRow).name ?? raw}」). 게이트 배지는 미션 목록에서 받기 전에 보이는데, 숨김 배지는 받기 전에 이름이 보이면 안 돼요. 숨김이 아닌 배지로 바꿔 주세요.`,
    }
  }
  return { ok: true }
}

// ── 사용처 조회 (숨김으로 바꾸는 저장을 막는다) ─────────────────────────────────────────

export type BadgeUsageKind = 'mission_reward' | 'mission_gate_badge' | 'prerequisite' | 'cross_gate'

export interface BadgeUsage {
  kind: BadgeUsageKind
  /** 쓰는 쪽 이름: 미션이면 제목, 배지면 이름 */
  owner: string
}

/** 사용처를 찾을 배지. 새로 만드는 배지는 `id`가 없다(이름·계열이 이미 쓰이는지만 본다) */
export interface BadgeUsageTarget {
  id?: string | null
  name: string
  familyKey?: string | null
}

const USAGE_LABEL: Record<BadgeUsageKind, string> = {
  mission_reward: '미션 보상',
  mission_gate_badge: '게이트 미션의 본 배지',
  prerequisite: '다른 배지의 선행 배지',
  cross_gate: '다른 배지의 교차 게이트',
}

const PAGE_SIZE = 1000

type ConfigBadge = { id: string; name: string; condition_json: BadgeCondition | null }

/**
 * 이 배지가 이미 쓰이는 곳을 모두 찾는다.
 *  - 미션 `reward_badge_ids`와 `gated_badge_id`는 id로 찾는다(`id`가 있을 때만).
 *  - 다른 배지의 `prerequisite_badge_names`는 이름으로, 교차 게이트 3종(`cross_in_axis`·`cross_between_axis`·`gate_mission_badge`)의
 *    `family_keys`는 이 배지의 계열 키로 찾는다. 자기 자신은 뺀다.
 * 읽기에 실패하면 던진다 — 사용처를 모르는 채로 통과시키지 않는다.
 */
export async function findBadgeUsages(supabase: SupabaseClient, target: BadgeUsageTarget): Promise<BadgeUsage[]> {
  const usages: BadgeUsage[] = []

  if (target.id) {
    const rewarded = await supabase.from('missions').select('id, title').contains('reward_badge_ids', [target.id])
    if (rewarded.error) throw new Error(`미션 보상 사용처 조회 실패: ${rewarded.error.message}`)
    for (const mission of (rewarded.data ?? []) as { title: string }[]) usages.push({ kind: 'mission_reward', owner: mission.title })

    const gated = await supabase.from('missions').select('id, title').eq('gated_badge_id', target.id)
    if (gated.error) throw new Error(`게이트 미션 사용처 조회 실패: ${gated.error.message}`)
    for (const mission of (gated.data ?? []) as { title: string }[]) usages.push({ kind: 'mission_gate_badge', owner: mission.title })
  }

  const targetFamilyKey = familyKeyOf({ name: target.name, family_key: target.familyKey ?? null })
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await supabase
      .from('badges')
      .select('id, name, condition_json')
      .is('deleted_at', null)
      .not('condition_json', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (page.error) throw new Error(`배지 조건 사용처 조회 실패: ${page.error.message}`)
    const rows = (page.data ?? []) as ConfigBadge[]
    for (const row of rows) {
      if (target.id && row.id === target.id) continue
      const condition = row.condition_json
      if (!condition || typeof condition !== 'object') continue
      if (Array.isArray(condition.prerequisite_badge_names) && condition.prerequisite_badge_names.includes(target.name)) {
        usages.push({ kind: 'prerequisite', owner: row.name })
      }
      const crossGateHit = CROSS_GATE_CONDITION_KEYS.some((key) => {
        const familyKeys = (condition[key] as { family_keys?: unknown } | undefined)?.family_keys
        return Array.isArray(familyKeys) && familyKeys.includes(targetFamilyKey)
      })
      if (crossGateHit) usages.push({ kind: 'cross_gate', owner: row.name })
    }
    if (rows.length < PAGE_SIZE) break
  }
  return usages
}

/** 사용처를 «미션 보상(「A」, 「B」), 다른 배지의 선행 배지(「C」)» 모양으로 줄인다 */
export function describeBadgeUsages(usages: readonly BadgeUsage[]): string {
  const kinds = Object.keys(USAGE_LABEL) as BadgeUsageKind[]
  return kinds
    .map((kind) => {
      const owners = usages.filter((usage) => usage.kind === kind).map((usage) => usage.owner)
      return owners.length > 0 ? `${USAGE_LABEL[kind]}(${listNames(owners)})` : null
    })
    .filter((part): part is string => part !== null)
    .join(', ')
}

/** 숨김으로 저장하려는 배지가 이미 쓰이는 곳이 있을 때의 거절 문구 (현상 → 원인 → 해결책) */
export function hiddenBlockedByUsageMessage(usages: readonly BadgeUsage[]): string {
  return `숨김 배지로 저장할 수 없습니다. 이 배지는 이미 ${describeBadgeUsages(usages)}에 쓰이고 있어요. 숨김 배지는 받기 전에 이름이 보이면 안 되는데, 이런 곳에서는 받기 전에 보여요. 쓰는 곳에서 이 배지를 먼저 빼고 다시 저장해 주세요.`
}

/**
 * 배지를 숨김으로 저장해도 되는지 사용처로 판정한다. 쓰이는 곳이 있으면 막는다.
 * 호출부는 «숨김이 아니던 배지를 숨김으로 바꾸는» 저장과 «숨김으로 새로 만드는» 저장에서만 부른다.
 */
export async function checkHiddenBadgeUsage(
  supabase: SupabaseClient,
  target: BadgeUsageTarget
): Promise<({ ok: true }) | ({ ok: false } & SaveBlock)> {
  let usages: BadgeUsage[]
  try {
    usages = await findBadgeUsages(supabase, target)
  } catch (error) {
    console.error('[checkHiddenBadgeUsage] 사용처 조회 오류:', error)
    return { ok: false, status: 500, error: READ_FAILED_MESSAGE }
  }
  if (usages.length > 0) return { ok: false, status: 400, error: hiddenBlockedByUsageMessage(usages) }
  return { ok: true }
}

// ── 노출 가림 ─────────────────────────────────────────────────────────────────────

/** 미션 행에서 숨김 보상 배지 id를 뺀다. 화면(서버 컴포넌트)이 클라이언트로 넘기기 전에 쓴다. 원본은 바꾸지 않는다 */
export function withoutHiddenRewardBadgeIds<T extends { reward_badge_ids?: string[] | null }>(
  mission: T,
  hiddenBadgeIds: ReadonlySet<string>
): T {
  if (!mission.reward_badge_ids || hiddenBadgeIds.size === 0) return mission
  return { ...mission, reward_badge_ids: mission.reward_badge_ids.filter((id) => !hiddenBadgeIds.has(id)) }
}
