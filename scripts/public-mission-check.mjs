// 주간 점검용 공개 미션 점검 — 순수 함수 (티켓 20260924_1502)
//
// 규칙 원천은 docs/specs/SERVICE_OPERATIONS.md §9-5다. 노출 판정은
// jam-web/src/lib/missions/visibility.ts의 isMissionExposed와 같은 규칙을 따른다.
// 반환은 집계 건수만이며 미션 제목·유저 정보는 넣지 않는다.

function isPublic(m) {
  return m.gate_axis == null && m.gated_badge_id == null && m.visibility_rule_json == null
}

function isExposed(m, nowMs) {
  const mode = m.exposure_mode ?? 'start_date'
  if (mode === 'hidden') return false
  if (mode === 'scheduled') {
    return m.exposure_at != null && new Date(m.exposure_at).getTime() <= nowMs
  }
  return new Date(m.starts_at).getTime() <= nowMs
}

function isNotEnded(m, nowMs) {
  return m.ends_at == null || new Date(m.ends_at).getTime() > nowMs
}

export function computePublicMissionCheck(missions, badges, now = new Date()) {
  const nowMs = now.getTime()
  const publicMissions = (missions ?? []).filter(isPublic)
  const joinable = publicMissions.filter((m) => isExposed(m, nowMs) && isNotEnded(m, nowMs))

  const validBadgeIds = new Set(
    (badges ?? []).filter((b) => b.deleted_at == null).map((b) => b.id)
  )
  let validRewardBadges = 0
  let invalidRewardBadges = 0
  for (const m of publicMissions.filter((x) => x.ends_at == null)) {
    for (const id of m.reward_badge_ids ?? []) {
      if (validBadgeIds.has(id)) validRewardBadges += 1
      else invalidRewardBadges += 1
    }
  }

  return { joinableCount: joinable.length, validRewardBadges, invalidRewardBadges }
}

export function formatPublicMissionCheck(check) {
  const warnJoinable = check.joinableCount === 0 ? ' [주의]' : ''
  const warnBadge = check.invalidRewardBadges > 0 ? ' [주의]' : ''
  return [
    `- 공개 미션 점검: 참가 가능 ${check.joinableCount}건${warnJoinable}`,
    `- 상시 공개 미션 보상 배지: 유효 ${check.validRewardBadges}건, 삭제·미조회 ${check.invalidRewardBadges}건${warnBadge}`,
  ]
}
