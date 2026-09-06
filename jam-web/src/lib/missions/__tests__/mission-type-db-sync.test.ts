/**
 * mission_type — 코드(TypeScript) ↔ DB CHECK 제약 동기화 회귀 테스트
 * (티켓 20260906_2231 게이트 리뷰 FAIL 재발 방지)
 *
 * 배경: 이 티켓 초안은 `MissionType`에 `engine_condition`을 추가하고 코드 쪽(레지스트리·
 * checker.ts·condition-keys.ts)은 전부 고쳤지만, `missions.mission_type` DB CHECK 제약
 * (`missions_mission_type_check`)은 갱신하지 않았다 — 마이그레이션 142가 `condition_json`
 * 허용 키(배지 쪽)만 확장하고 `mission_type` 자체(082가 만들고 103이 값 하나를 바꾼 제약)는
 * 건드리지 않았기 때문이다. 그 결과 `seed_v5_gate_missions.sql`의
 * `mission_type='engine_condition'` INSERT 33건이 전부 CHECK 위반으로 트랜잭션 롤백된다
 * (게이트 리뷰 실측). `condition-registry.test.ts`가 `condition_json` 키에 대해 이미 강제하는
 * 「레지스트리 ↔ DB CHECK ↔ 트리거」 3자 동기화와 같은 원칙을, `mission_type` 값에도
 * 적용해 이 누락이 재발하지 않게 한다.
 *
 * 동기화 3자 대조:
 *   ① `MissionType`(타입, 컴파일 타임에만 존재) — 런타임에서 직접 볼 수 없으므로
 *      `MISSION_TYPE_LABEL`(badge-labels.ts)을 대리 출처로 쓴다. 이 맵은
 *      `Record<MissionType, string>`으로 선언돼 있어 `MissionType`에 값을 추가하고
 *      이 맵에 라벨을 안 넣으면 **컴파일 에러**가 난다(TS가 이미 강제) — 따라서
 *      `Object.keys(MISSION_TYPE_LABEL)`은 항상 `MissionType`의 전체 멤버와 같다.
 *   ② `MISSION_TYPES`(badge-labels.ts, 어드민 <select> 순서/유효값 배열) — ①과 같은
 *      소스 파일이 손으로 관리하는 배열이라 따로 대조한다(하나만 고치고 하나를 빠뜨리는
 *      실수를 잡는다).
 *   ③ DB `missions_mission_type_check` — 이 제약을 마지막으로 다시 쓴 마이그레이션 SQL을
 *      직접 읽어 파싱한다. **CHECK/mission_type을 다시 쓰는 마이그레이션을 추가할 때마다
 *      아래 `LATEST_MIGRATION_FILE`을 그 파일로 갱신할 것** — 옛 파일을 계속 읽으면
 *      「코드는 늘었는데 DB는 그대로」인 상태를 통과시켜 버려 이 테스트의 존재 이유가 없어진다
 *      (082 → 103 → **142**, 이 순서로 이 제약을 다시 썼다).
 *
 * 실행: `npx tsx src/lib/missions/__tests__/mission-type-db-sync.test.ts`
 *       (테스트 러너 불필요 — node assert 사용. package.json의 test:node가 이 디렉터리를 실행한다)
 */
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { MISSION_TYPES, MISSION_TYPE_LABEL } from '@/lib/admin/badge-labels'

const REPO_ROOT = path.resolve(__dirname, '../../../..')

/** ③ missions_mission_type_check를 마지막으로 다시 쓴 마이그레이션 — 신규 값 추가 시 갱신할 것 */
const LATEST_MIGRATION_FILE = 'supabase/migrations/142_condition_keys_mission_gate_extension.sql'

/**
 * SQL 텍스트에서 `ADD CONSTRAINT missions_mission_type_check ... CHECK (mission_type IN (...))`
 * 블록 안의 작은따옴표 리터럴을 뽑는다. 주석(`--`)은 걷어내고 본다.
 */
function extractMissionTypeCheckValues(sql: string): string[] {
  const marker = 'ADD CONSTRAINT missions_mission_type_check'
  const from = sql.indexOf(marker)
  assert.ok(from > -1, `마커를 찾지 못했다: ${marker} (파일: ${LATEST_MIGRATION_FILE})`)
  const open = sql.indexOf('IN (', from)
  assert.ok(open > -1, 'CHECK (mission_type IN (...) 블록을 찾지 못했다')
  const close = sql.indexOf('));', open)
  assert.ok(close > -1, 'CHECK 블록의 닫는 괄호를 찾지 못했다')
  const body = sql
    .slice(open + 'IN ('.length, close)
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

const cases: Array<[string, () => void]> = [
  ['DB CHECK(missions_mission_type_check)의 허용 값이 MISSION_TYPE_LABEL의 키와 같다', () => {
    const sql = fs.readFileSync(path.join(REPO_ROOT, LATEST_MIGRATION_FILE), 'utf8')
    const dbValues = extractMissionTypeCheckValues(sql)
    const codeValues = Object.keys(MISSION_TYPE_LABEL)
    assert.deepStrictEqual(
      [...dbValues].sort(),
      [...codeValues].sort(),
      `DB CHECK와 MissionType이 어긋난다 — DB: [${dbValues.sort()}] / 코드: [${codeValues.sort()}]`
    )
  }],

  ['DB CHECK(missions_mission_type_check)의 허용 값이 MISSION_TYPES 배열과 같다', () => {
    const sql = fs.readFileSync(path.join(REPO_ROOT, LATEST_MIGRATION_FILE), 'utf8')
    const dbValues = extractMissionTypeCheckValues(sql)
    assert.deepStrictEqual(
      [...dbValues].sort(),
      [...MISSION_TYPES].sort(),
      `DB CHECK와 MISSION_TYPES(어드민 <select> 목록)가 어긋난다 — DB: [${dbValues.sort()}] / 코드: [${[...MISSION_TYPES].sort()}]`
    )
  }],

  ['engine_condition이 DB CHECK에 실제로 들어 있다 (이번 게이트 리뷰 FAIL의 직접 재발 방지)', () => {
    const sql = fs.readFileSync(path.join(REPO_ROOT, LATEST_MIGRATION_FILE), 'utf8')
    const dbValues = extractMissionTypeCheckValues(sql)
    assert.ok(
      dbValues.includes('engine_condition'),
      'engine_condition이 missions_mission_type_check에 없다 — seed_v5_gate_missions.sql의 ' +
        '33건 INSERT가 CHECK 위반으로 롤백된다'
    )
  }],

  ['082/103이 확정한 기존 7종 값을 하나도 빠뜨리지 않았다', () => {
    const sql = fs.readFileSync(path.join(REPO_ROOT, LATEST_MIGRATION_FILE), 'utf8')
    const dbValues = extractMissionTypeCheckValues(sql)
    const legacySeven = [
      'distance', 'checkin', 'activity_count', 'item_collect',
      'streak_days', 'duration_minutes', 'elevation_gain_m',
    ]
    for (const value of legacySeven) {
      assert.ok(dbValues.includes(value), `기존 값이 빠졌다: ${value}`)
    }
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[mission-type-db-sync] ${passed}/${cases.length} passed`)
