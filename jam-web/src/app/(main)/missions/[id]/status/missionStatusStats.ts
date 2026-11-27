import type { MissionType } from '@/types/database'
import { formatMissionProgress, missionProgressUnit } from '@/lib/missions/format'
import type { AchievementEntry, RankingEntry } from './missionStatusTypes'

/** 값과 단위를 붙인 표시 글자 — «12.0km» */
export function formatProgressWithUnit(value: number, missionType: MissionType): string {
  return `${formatMissionProgress(value, missionType)}${missionProgressUnit(missionType)}`
}

/**
 * «1위와 차이» 글자 — 1위 값에서 내 값을 뺀 만큼(0 아래로 내려가지 않는다). 내가 1위이거나, 내 기록이 없거나, 1위 행이 응답에 없으면 «—»다.
 * 표시용 계산일 뿐 응답 계약은 바꾸지 않는다(티켓 20261127_1145).
 */
export function gapToFirstText(entries: readonly RankingEntry[], me: RankingEntry | null, missionType: MissionType): string {
  const first = entries[0]
  if (!me || !first || me.rank <= 1) return '—'
  return formatProgressWithUnit(Math.max(0, first.progressValue - me.progressValue), missionType)
}

/**
 * «달성한 참가자» 수. 달성형 응답은 내 행을 뺀 다른 참가자를 «달성한 사람 먼저» 정렬해 `visible_rank_count`까지 잘라 보낸다.
 * - 잘리지 않았으면(보이는 수 = 다른 참가자 수) 보이는 달성자 + 내 달성 여부로 정확히 센다.
 * - 잘렸어도 보이는 행에 미달성자가 있으면, 달성자가 먼저 나오므로 달성자는 모두 보인 것이다 — 정확하다.
 * - 잘렸는데 보이는 행이 전부 달성자이면 숨은 달성자가 더 있을 수 있어 알 수 없다 → null(화면은 «—»). 응답 필드를 늘리는 것은 이 티켓 밖이다.
 */
export function achievedCount(
  others: readonly AchievementEntry[],
  me: AchievementEntry | null,
  totalParticipants: number,
): number | null {
  const otherTotal = me ? Math.max(totalParticipants - 1, 0) : totalParticipants
  const visibleAchieved = others.filter((e) => e.achieved).length
  const truncated = others.length < otherTotal
  if (truncated && visibleAchieved === others.length) return null
  return visibleAchieved + (me?.achieved ? 1 : 0)
}
