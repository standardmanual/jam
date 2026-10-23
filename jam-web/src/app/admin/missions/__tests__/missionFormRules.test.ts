/**
 * 어드민 미션 양식의 순수 판정 — 순위형 제한 안내·저장 전 검사·트라이브 요청 본문 (티켓 20261019_1318 1회)
 *
 * 폼 구성 요소에는 시험이 없어서 폼이 보이는 문구와 저장 전 검사를 `missionFormRules.ts`로 빼고 여기서 고정한다.
 * 순위형 금지 판정은 서버 저장 검사와 같은 함수(`rankingConditionError`)여야 해서, 서버 결과와 어긋나지 않는지도 대조한다.
 * 이 폴더는 `vitest.config.ts`의 `**\/admin/missions/__tests__/**` 제외 대상이라 node:assert + 자체 러너로 쓴다
 * (`package.json`의 `test:node`가 돈다).
 *
 * 실행: `npx tsx src/app/admin/missions/__tests__/missionFormRules.test.ts`
 */
import assert from 'node:assert'
import {
  buildMissionTribePayload,
  findMissionFormSaveError,
  lockedRewardBadgeNames,
  lockedRewardNotice,
  missionFormTribeLabel,
  missionScopeFrom,
  rankingBlockReason,
  rankingFrameNotice,
  sortMissionFormTribes,
  NIGHT_SAFETY_NOTICE,
  type MissionFormTribe,
} from '../missionFormRules'
import {
  buildMissionConditionJson,
  emptyMissionConditionFields,
  type MissionConditionFormFields,
} from '../missionConditionFields'
import { checkMissionCondition, rankingConditionError, usesNightCondition } from '@/lib/missions/condition-keys'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const NIGHT = { activity_type: 'running', time_range: { start: '22:00', end: '05:00' } }
const MORNING = { activity_type: 'running', distance_km: 10, time_range: { start: '05:00', end: '08:00' } }
const CAPSULE = { capsule_open_count: 3 }
const BOTH = { capsule_open_count: 3, time_range: { start: '23:00', end: '04:00' } }

function fields(overrides: Partial<MissionConditionFormFields> = {}): MissionConditionFormFields {
  return { ...emptyMissionConditionFields(), ...overrides }
}

function tribe(overrides: Partial<MissionFormTribe> & { id: string }): MissionFormTribe {
  return { name: '이름', isActive: true, sortOrder: 0, ...overrides }
}

const cases: Array<[string, () => void]> = [
  // ── 순위형 제한 안내 ────────────────────────────────────────────────────
  ['rankingBlockReason: 밤 조건이면 밤 이유 한 문장', () => {
    const reason = rankingBlockReason(NIGHT)
    assert.ok(reason, '밤 조건은 랭킹형을 막아야 한다')
    assert.ok(reason.includes('밤 조건'))
    assert.ok(!reason.includes('캡슐'))
    assert.ok(reason.includes('랭킹형을 고를 수 없어요'))
  }],
  ['rankingBlockReason: 캡슐 연 횟수면 캡슐 이유', () => {
    const reason = rankingBlockReason(CAPSULE)
    assert.ok(reason)
    assert.ok(reason.includes('캡슐 연 횟수'))
    assert.ok(!reason.includes('밤 조건'))
  }],
  ['rankingBlockReason: 둘 다 있으면 둘 다 말한다', () => {
    const reason = rankingBlockReason(BOTH)
    assert.ok(reason)
    assert.ok(reason.includes('밤 조건') && reason.includes('캡슐 연 횟수'))
  }],
  ['rankingBlockReason: 밤이 아닌 시간대·일반 조건·빈 조건은 막지 않는다', () => {
    assert.strictEqual(rankingBlockReason(MORNING), null)
    assert.strictEqual(rankingBlockReason({ distance_km: 50 }), null)
    assert.strictEqual(rankingBlockReason(null), null)
    assert.strictEqual(rankingBlockReason(undefined), null)
    assert.strictEqual(rankingBlockReason([]), null)
  }],
  ['rankingBlockReason: 서버 저장 검사(rankingConditionError)와 항상 같은 결론이다', () => {
    for (const cond of [NIGHT, MORNING, CAPSULE, BOTH, { distance_km: 5 }, null, {}, { time_range: { start: '18:00', end: '22:00' } }]) {
      const blocked = rankingBlockReason(cond) !== null
      assert.strictEqual(blocked, rankingConditionError(cond, 'ranking') !== null, JSON.stringify(cond))
    }
  }],
  ['rankingBlockReason: 폼이 만드는 조건(연속 달성 안의 밤 시간대)도 막는다', () => {
    const cond = buildMissionConditionJson(
      'engine_condition',
      fields({
        weeklyStreak: '4',
        streakSubsetMinCount: '2',
        streakSubsetTimeStart: '22:00',
        streakSubsetTimeEnd: '05:00',
      })
    )
    assert.ok(cond, '폼이 조건을 만들어야 한다')
    assert.ok(usesNightCondition(cond))
    assert.ok(rankingBlockReason(cond))
    // 같은 조건을 달성형으로 저장하면 서버도 통과시킨다
    assert.strictEqual(checkMissionCondition('engine_condition', cond, 'achievement').error, null)
    assert.ok(checkMissionCondition('engine_condition', cond, 'ranking').error)
  }],
  ['밤 조건 안전 안내 문구는 어드민용 한 문장이다', () => {
    assert.strictEqual(
      NIGHT_SAFETY_NOTICE,
      '유저 화면에 안전 안내가 늘 붙어요. 이름과 설명은 활동을 권하지 않고 기념하는 말로 써 주세요.'
    )
  }],

  // ── 저장 전 검사 ────────────────────────────────────────────────────────
  ['저장 전 검사: 트라이브 미션은 트라이브를 1개 이상 골라야 한다', () => {
    const base = { statusDisplayType: 'achievement', condition: { distance_km: 10 } }
    const error = findMissionFormSaveError({ ...base, scope: 'tribe', allowedTribeIds: [] })
    assert.ok(error && error.includes('트라이브를 하나 이상 골라야 해요'))
    assert.strictEqual(findMissionFormSaveError({ ...base, scope: 'tribe', allowedTribeIds: [A] }), null)
  }],
  ['저장 전 검사: 공통 미션은 트라이브 선택이 없어도 된다', () => {
    assert.strictEqual(
      findMissionFormSaveError({ scope: 'common', allowedTribeIds: [], statusDisplayType: 'achievement', condition: { distance_km: 10 } }),
      null
    )
  }],
  ['저장 전 검사: 랭킹형으로 정해진 채 밤 조건이면 저장 전에 알리고 틀을 바꾸라고 안내한다', () => {
    const error = findMissionFormSaveError({ scope: 'common', allowedTribeIds: [], statusDisplayType: 'ranking', condition: NIGHT })
    assert.ok(error)
    assert.ok(error.includes('지금 랭킹형으로 정해져 있어서'))
    assert.ok(error.includes('밤 조건'))
    assert.ok(error.includes('달성형이나 개인형으로 바꿔야 저장할 수 있어요'))
  }],
  ['틀 선택 안내: 랭킹형이 아니면 이유만, 랭킹형이면 바꾸라는 말을 덧붙이고, 막힐 조건이 없으면 없다', () => {
    const reason = rankingBlockReason(CAPSULE)
    assert.strictEqual(rankingFrameNotice('achievement', CAPSULE), reason)
    assert.strictEqual(rankingFrameNotice('individual', CAPSULE), reason)
    const onRanking = rankingFrameNotice('ranking', CAPSULE)
    assert.ok(onRanking && onRanking.startsWith(reason as string) && onRanking.includes('바꿔야 저장할 수 있어요'))
    assert.strictEqual(rankingFrameNotice('ranking', MORNING), null)
    assert.strictEqual(rankingFrameNotice('achievement', null), null)
  }],
  ['저장 전 검사: 달성형·개인형은 밤 조건과 캡슐 연 횟수를 막지 않는다', () => {
    for (const frame of ['achievement', 'individual']) {
      for (const condition of [NIGHT, CAPSULE, BOTH]) {
        assert.strictEqual(
          findMissionFormSaveError({ scope: 'common', allowedTribeIds: [], statusDisplayType: frame, condition }),
          null,
          `${frame} ${JSON.stringify(condition)}`
        )
      }
    }
  }],
  ['저장 전 검사: 랭킹형이어도 막힐 조건이 없으면 통과한다', () => {
    assert.strictEqual(
      findMissionFormSaveError({ scope: 'common', allowedTribeIds: [], statusDisplayType: 'ranking', condition: MORNING }),
      null
    )
  }],
  ['저장 전 검사: 입력 범위를 벗어난 위임 키 값은 어떤 틀에서도 저장 전에 알린다 (20261021_1114 1회)', () => {
    const condition = buildMissionConditionJson('engine_condition', fields({ distinctTimeBands: '9', avgWatts: '300' }))
    for (const frame of ['achievement', 'individual', 'ranking']) {
      const error = findMissionFormSaveError({ scope: 'common', allowedTribeIds: [], statusDisplayType: frame, condition })
      assert.ok(error && error.includes('서로 다른 시간대 9개(허용 범위 2~6개)'), `${frame}: ${error}`)
      assert.ok(error.includes('범위 안의 값으로 고쳐서 다시 저장해 주세요'))
    }
    const inRange = buildMissionConditionJson('engine_condition', fields({ distinctTimeBands: '3', avgWatts: '300' }))
    assert.strictEqual(
      findMissionFormSaveError({ scope: 'common', allowedTribeIds: [], statusDisplayType: 'achievement', condition: inRange }),
      null
    )
  }],

  // ── 요청 본문 ───────────────────────────────────────────────────────────
  ['요청 본문: 트라이브 미션은 고른 목록을 보내고, 공통 미션은 빈 목록으로 제한을 푼다', () => {
    assert.deepStrictEqual(buildMissionTribePayload('tribe', [A, B]), { scope: 'tribe', allowed_tribe_ids: [A, B] })
    assert.deepStrictEqual(buildMissionTribePayload('common', [A, B]), { scope: 'common', allowed_tribe_ids: [] })
  }],
  ['요청 본문: 목록을 복사해 보낸다(폼 상태를 직접 넘기지 않는다)', () => {
    const state = [A]
    const payload = buildMissionTribePayload('tribe', state)
    assert.notStrictEqual(payload.allowed_tribe_ids, state)
  }],
  ['수정 화면의 처음 종류: 허용 트라이브가 있으면 트라이브 미션, 없으면 공통 미션', () => {
    assert.strictEqual(missionScopeFrom([A]), 'tribe')
    assert.strictEqual(missionScopeFrom([]), 'common')
    assert.strictEqual(missionScopeFrom(undefined), 'common')
    assert.strictEqual(missionScopeFrom(null), 'common')
  }],

  // ── 트라이브 체크 목록 ──────────────────────────────────────────────────
  ['트라이브 목록: 활성이 먼저, 같은 활성 상태끼리는 정렬 순서 → 이름 순', () => {
    const sorted = sortMissionFormTribes([
      tribe({ id: 'c', name: '다', isActive: false, sortOrder: 0 }),
      tribe({ id: 'b', name: '나', isActive: true, sortOrder: 2 }),
      tribe({ id: 'a', name: '가', isActive: true, sortOrder: 1 }),
      tribe({ id: 'd', name: '라', isActive: true, sortOrder: 1 }),
    ])
    assert.deepStrictEqual(sorted.map((t) => t.id), ['a', 'd', 'b', 'c'])
  }],
  ['트라이브 목록: 정렬은 원본을 바꾸지 않는다', () => {
    const input = [tribe({ id: 'b', sortOrder: 2 }), tribe({ id: 'a', sortOrder: 1 })]
    sortMissionFormTribes(input)
    assert.deepStrictEqual(input.map((t) => t.id), ['b', 'a'])
  }],
  ['트라이브 목록: 비활성은 이름 옆에 표기한다', () => {
    assert.strictEqual(missionFormTribeLabel({ name: '러너', isActive: true }), '러너')
    assert.strictEqual(missionFormTribeLabel({ name: '라이더', isActive: false }), '라이더 (비활성)')
  }],

  // ── 잠김 읽기 전용 표시 ─────────────────────────────────────────────────
  ['잠김 표시: 잠김으로 만든 아이템 배지의 이름만 모은다', () => {
    const names = lockedRewardBadgeNames([
      { name: '주말 러너', always_locked: false },
      { name: '비밀 장갑', always_locked: true },
      { name: '구형 배지' },
      { name: '비밀 신발', always_locked: true },
    ])
    assert.deepStrictEqual(names, ['비밀 장갑', '비밀 신발'])
  }],
  ['잠김 표시: 잠긴 배지가 없으면 안내도 없다', () => {
    assert.strictEqual(lockedRewardNotice([]), null)
    assert.strictEqual(lockedRewardBadgeNames([]).length, 0)
  }],
  ['잠김 표시: 안내는 어느 배지인지와 «잠긴 채로 받는다»를 말한다', () => {
    const notice = lockedRewardNotice(['비밀 장갑', '비밀 신발'])
    assert.ok(notice)
    assert.ok(notice.includes('잠김으로 만든 아이템 배지: 비밀 장갑, 비밀 신발'))
    assert.ok(notice.includes('잠긴 채로 받아요'))
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[missionFormRules] ${passed}/${cases.length} passed`)
