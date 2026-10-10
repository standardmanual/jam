// 주간 점검용 공개 미션 점검 — 순수 함수 (티켓 20260924_1502)
//
// 규칙 원천은 docs/service/SERVICE_OPERATIONS.md §9-5다. 노출 판정은
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

/**
 * `admin-api-read.mjs`의 「공개 미션 점검」 출력 줄을 조립한다 (티켓 20260924_1512).
 * 인자는 API 조회 결과 그대로다: 미션은 배열, 배지는 `{ badges: [...] }`이고, 조회 실패한 쪽은 `{ __error: 사유 }`다.
 * 미션·배지 중 하나라도 조회에 실패하면 점검을 하지 않고 「확인 불가」 한 줄만 낸다(실패한 쪽 사유를 모두 적는다).
 */
export function buildPublicMissionCheckLines(missionsResult, badgesResult, now = new Date()) {
  const missionsError = missionsResult?.__error
  const badgesError = badgesResult?.__error
  if (missionsError || badgesError) {
    const reason = [
      missionsError && `미션 조회 실패: ${missionsError}`,
      badgesError && `배지 조회 실패: ${badgesError}`,
    ]
      .filter(Boolean)
      .join(', ')
    return [`- 공개 미션 점검: 확인 불가 (${reason})`]
  }
  // 배지 응답 자체가 null·undefined면 `.badges`를 읽을 수 없다(티켓 20260926_1535). `{}`·`{ badges: null }`처럼
  // 응답은 왔지만 목록이 비어 있는 경우와 달리 응답이 없었던 것이라 「확인 불가」 한 줄로 낸다.
  if (badgesResult == null) return ['- 공개 미션 점검: 확인 불가 (배지 응답 없음)']
  return formatPublicMissionCheck(computePublicMissionCheck(missionsResult, badgesResult?.badges, now))
}
