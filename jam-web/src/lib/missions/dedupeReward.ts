/**
 * 미션 목록 — 같은 보상 배지를 여는 게이트 미션 중복 제거 (티켓 20260907_0043)
 *
 * `20260906_2231`이 시딩한 게이트 미션 중 다수는 같은 보상 배지를 서로 다른 두 개
 * 이상의 축(`gate_axis`)에서 열 수 있게 설계돼, 미션 목록에 물리적으로 같은 보상이
 * 두 번 이상 카드로 나타난다(예: `주말의 증명` — `cycling:요일`/`cycling:주기`).
 *
 * 종목별로 여러 개(축마다 하나씩) 남는 것 자체는 유지 대상이라 건드리지 않는다
 * (사용자 확정, 티켓 참조). 이 함수는 "같은 물리적 보상 배지" 중복만 대표 1행으로
 * 합친다. 순수 함수 — Supabase·React 의존 없음.
 */
import type { MissionRow } from '@/types/database'
import type { MissionVisibilityResult } from './visibility'

/**
 * `reward_badge_ids`가 정확히 1개인 미션만 그룹핑 대상이다 — 다중 보상 미션까지
 * 잘못 묶이지 않도록 하는 안전장치(티켓 §상세요구사항).
 */
function isDedupeCandidate(mission: MissionRow): boolean {
  return (mission.reward_badge_ids ?? []).length === 1
}

/** 그룹 내 대표 행 선택. 우선순위: 참가중 → 열림(open) → 결정적 선택(gate_axis 알파벳순) */
function pickRepresentative(
  group: MissionRow[],
  participationSet: ReadonlySet<string>,
  visibilityMap: ReadonlyMap<string, MissionVisibilityResult>,
): MissionRow {
  // gate_axis 알파벳순 정렬을 먼저 적용해 두면, 아래 find()가 동률(참가중 2개·open 2개·
  // locked뿐)인 모든 경우에 그대로 "알파벳순 첫 번째" 타이브레이크가 된다.
  const sorted = [...group].sort((a, b) => (a.gate_axis ?? '').localeCompare(b.gate_axis ?? ''))

  const joined = sorted.find((m) => participationSet.has(m.id))
  if (joined) return joined

  const open = sorted.find((m) => visibilityMap.get(m.id)?.visibility === 'open')
  if (open) return open

  return sorted[0]
}

/**
 * `reward_badge_ids[0]` 기준으로 중복 게이트 미션을 대표 1행으로 합친다.
 * 원본 배열의 상대 순서(ends_at 오름차순)는 그대로 유지한다.
 */
export function dedupeByRewardBadge(
  missions: readonly MissionRow[],
  participationSet: ReadonlySet<string>,
  visibilityMap: ReadonlyMap<string, MissionVisibilityResult>,
): MissionRow[] {
  const groups = new Map<string, MissionRow[]>()
  for (const m of missions) {
    if (!isDedupeCandidate(m)) continue
    const key = m.reward_badge_ids[0]
    const arr = groups.get(key)
    if (arr) arr.push(m)
    else groups.set(key, [m])
  }

  const keepIds = new Set<string>()
  for (const m of missions) {
    if (!isDedupeCandidate(m)) {
      keepIds.add(m.id)
    }
  }
  for (const group of groups.values()) {
    const representative = group.length === 1 ? group[0] : pickRepresentative(group, participationSet, visibilityMap)
    keepIds.add(representative.id)
  }

  return missions.filter((m) => keepIds.has(m.id))
}
