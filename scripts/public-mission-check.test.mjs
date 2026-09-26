// public-mission-check.mjs 테스트 (티켓 20260924_1502)
// 실행: node scripts/public-mission-check.test.mjs
import assert from 'node:assert/strict'
import {
  buildPublicMissionCheckLines,
  computePublicMissionCheck,
  formatPublicMissionCheck,
} from './public-mission-check.mjs'

const NOW = new Date('2026-09-24T00:00:00Z')

function mission(over = {}) {
  return {
    gate_axis: null,
    gated_badge_id: null,
    visibility_rule_json: null,
    exposure_mode: 'start_date',
    exposure_at: null,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: null,
    reward_badge_ids: [],
    ...over,
  }
}

const BADGES = [
  { id: 'b1', deleted_at: null },
  { id: 'b2', deleted_at: '2026-09-10T00:00:00Z' },
]

function joinable(missions) {
  return computePublicMissionCheck(missions, BADGES, NOW).joinableCount
}

assert.equal(joinable([mission()]), 1, '기본 공개 미션은 참가 가능')
assert.equal(joinable([mission({ gate_axis: 'run' })]), 0, '게이트 축 미션 제외')
assert.equal(joinable([mission({ gated_badge_id: 'b1' })]), 0, '게이트 배지 미션 제외')
assert.equal(
  joinable([mission({ visibility_rule_json: { require_owned: [] } })]),
  0,
  '노출 조건 미션 제외'
)
assert.equal(joinable([mission({ starts_at: '2026-10-01T00:00:00Z' })]), 0, '시작 전 제외')
assert.equal(joinable([mission({ ends_at: '2026-09-20T00:00:00Z' })]), 0, '종료됨 제외')
assert.equal(joinable([mission({ ends_at: '2026-10-20T00:00:00Z' })]), 1, '종료 전 포함')
assert.equal(joinable([mission({ exposure_mode: 'hidden' })]), 0, 'hidden 제외')
assert.equal(
  joinable([mission({ exposure_mode: 'scheduled', exposure_at: '2026-10-01T00:00:00Z' })]),
  0,
  'scheduled 미도래 제외'
)
assert.equal(
  joinable([mission({ exposure_mode: 'scheduled', exposure_at: '2026-09-20T00:00:00Z' })]),
  1,
  'scheduled 도래 포함'
)
assert.equal(
  joinable([mission({ exposure_mode: 'scheduled', exposure_at: null })]),
  0,
  'scheduled인데 exposure_at이 없으면 제외'
)

// 상시 미션 보상 배지: 유효 1(b1), 삭제 1(b2), 미조회 1(b3). 기간형 미션의 배지는 세지 않는다
const rewardCheck = computePublicMissionCheck(
  [
    mission({ reward_badge_ids: ['b1', 'b2', 'b3'] }),
    mission({ ends_at: '2026-12-01T00:00:00Z', reward_badge_ids: ['b3'] }),
  ],
  BADGES,
  NOW
)
assert.equal(rewardCheck.validRewardBadges, 1)
assert.equal(rewardCheck.invalidRewardBadges, 2)

// 빈 배열·null
assert.deepEqual(computePublicMissionCheck([], [], NOW), {
  joinableCount: 0,
  validRewardBadges: 0,
  invalidRewardBadges: 0,
})
assert.equal(computePublicMissionCheck(null, null, NOW).joinableCount, 0)

// 출력 형식
assert.deepEqual(
  formatPublicMissionCheck({ joinableCount: 2, validRewardBadges: 1, invalidRewardBadges: 0 }),
  ['- 공개 미션 점검: 참가 가능 2건', '- 상시 공개 미션 보상 배지: 유효 1건, 삭제·미조회 0건']
)
const warn = formatPublicMissionCheck({
  joinableCount: 0,
  validRewardBadges: 0,
  invalidRewardBadges: 1,
})
assert.ok(warn[0].endsWith(' [주의]') && warn[1].endsWith(' [주의]'))

// 출력 조립 (티켓 20260924_1512) — 조회 실패 「확인 불가」 분기
const okMissions = [mission({ reward_badge_ids: ['b1'] })]
const okBadges = { badges: BADGES }
assert.deepEqual(buildPublicMissionCheckLines(okMissions, okBadges, NOW), [
  '- 공개 미션 점검: 참가 가능 1건',
  '- 상시 공개 미션 보상 배지: 유효 1건, 삭제·미조회 0건',
])
assert.deepEqual(buildPublicMissionCheckLines({ __error: 'HTTP 500' }, okBadges, NOW), [
  '- 공개 미션 점검: 확인 불가 (미션 조회 실패: HTTP 500)',
])
assert.deepEqual(buildPublicMissionCheckLines(okMissions, { __error: 'timeout' }, NOW), [
  '- 공개 미션 점검: 확인 불가 (배지 조회 실패: timeout)',
])
assert.deepEqual(buildPublicMissionCheckLines({ __error: 'HTTP 500' }, { __error: 'timeout' }, NOW), [
  '- 공개 미션 점검: 확인 불가 (미션 조회 실패: HTTP 500, 배지 조회 실패: timeout)',
])

console.log('public-mission-check.test.mjs 통과')
