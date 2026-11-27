import type { MissionType } from '@/types/database'
import { formatMissionProgress, missionProgressUnit } from '@/lib/missions/format'
import type { RankingEntry } from './missionStatusTypes'

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
