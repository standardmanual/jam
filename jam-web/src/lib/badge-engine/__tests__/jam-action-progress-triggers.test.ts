/**
 * 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표가 «다시 볼 지표»를 정하는 규칙 테스트 (티켓 20261001_0633)
 *
 * 순수 상수·함수라 DB 모킹이 없다. 호출 지점은 셋이다: 새 활동이 있는 동기화 / 새 활동이 없는 동기화 / 컬렉션 장착.
 * 순환 방지 계약(`jamActionBadges.ts`가 `@/lib/strava/sync`·`./jamActionRoute`를 import하지 않는다)도 소스 텍스트로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-progress-triggers.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JAM_EMPTY_SYNC_TRIGGERS, JAM_SYNC_TRIGGERS, jamTriggersForSlot } from '../jamActionProgressTriggers'
import { JAM_ACTION_CONDITION_KEYS, JAM_ACTION_MODIFIER_KEYS } from '../jamActionBadges'

describe('JAM_SYNC_TRIGGERS — 새 활동이 있는 동기화가 끝날 때', () => {
  it('주 키 5개를 한 번에 판정한다', () => {
    expect([...JAM_SYNC_TRIGGERS].sort()).toEqual(
      [
        'collection_complete_count',
        'days_since_signup',
        'mission_complete_count',
        'same_spot_checkin_days',
        'weekly_active_days',
      ].sort()
    )
  })

  it('보조 키는 트리거가 아니므로 넣지 않는다', () => {
    for (const key of JAM_ACTION_MODIFIER_KEYS) expect(JAM_SYNC_TRIGGERS as readonly string[]).not.toContain(key)
  })

  it('중복이 없다', () => {
    expect(new Set(JAM_SYNC_TRIGGERS).size).toBe(JAM_SYNC_TRIGGERS.length)
  })
})

describe('JAM_EMPTY_SYNC_TRIGGERS — 새 활동이 없는 동기화가 끝날 때', () => {
  it('가입 경과일만 판정한다 — 날짜가 지나면 값이 바뀌는 지표는 이것뿐이다', () => {
    expect(JAM_EMPTY_SYNC_TRIGGERS).toEqual(['days_since_signup'])
  })
})

describe('jamTriggersForSlot — 컬렉션 장착이 성공했을 때', () => {
  it('컬렉션 완성 수만 다시 본다', () => {
    expect(jamTriggersForSlot()).toEqual(['collection_complete_count'])
  })

  it('호출할 때마다 새 배열을 돌려준다 — 호출부가 바꿔도 다음 호출에 영향이 없다', () => {
    const first = jamTriggersForSlot()
    first.push('mission_complete_count')
    expect(jamTriggersForSlot()).toEqual(['collection_complete_count'])
  })
})

describe('돌려주는 모든 키는 JAM! 행동 지표 키다', () => {
  it('세 규칙의 키가 JAM_ACTION_CONDITION_KEYS에 있다', () => {
    const judged = new Set<string>(JAM_ACTION_CONDITION_KEYS)
    for (const key of [...JAM_SYNC_TRIGGERS, ...JAM_EMPTY_SYNC_TRIGGERS, ...jamTriggersForSlot()]) {
      expect(judged.has(key), `${key}가 JAM_ACTION_CONDITION_KEYS에 없다`).toBe(true)
    }
  })
})

describe('순환 방지 — sync.ts가 import하는 파일은 sync.ts를 import하지 않는다 (소스 텍스트 검사)', () => {
  const read = (name: string) => readFileSync(join(process.cwd(), 'src/lib/badge-engine', name), 'utf-8')

  /** 주석을 걷어내고 import 문만 본다 — 머리 주석이 이 모듈 이름을 설명하기 때문이다 */
  const importLines = (source: string) =>
    source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line))
      .join('\n')

  it('jamActionBadges.ts는 @/lib/strava/sync도 ./jamActionRoute도 import하지 않는다', () => {
    const imports = importLines(read('jamActionBadges.ts'))
    expect(imports).not.toContain('@/lib/strava/sync')
    expect(imports).not.toContain('./jamActionRoute')
  })

  it('jamActionProgressTriggers.ts는 @/lib/strava/sync도 ./jamActionRoute도 import하지 않고, jamActionBadges는 type만 가져온다', () => {
    const imports = importLines(read('jamActionProgressTriggers.ts'))
    expect(imports).not.toContain('@/lib/strava/sync')
    expect(imports).not.toContain('./jamActionRoute')
    expect(imports).toMatch(/import type \{ JamActionTrigger \} from '\.\/jamActionBadges'/)
  })

  it('계산 모듈(활동일·완료 수·페이징)도 sync.ts를 import하지 않는다', () => {
    for (const name of ['jamActionDayMetrics.ts', 'jamActionCompletionMetrics.ts', 'jamActionPaging.ts']) {
      const imports = importLines(read(name))
      expect(imports, name).not.toContain('@/lib/strava/sync')
      expect(imports, name).not.toContain('./jamActionRoute')
    }
  })

  it('sync.ts는 판정 틀과 트리거 규칙을 import한다 (동기화가 직접 부른다)', () => {
    const syncSource = readFileSync(join(process.cwd(), 'src/lib/strava/sync.ts'), 'utf-8')
    expect(syncSource).toContain("from '@/lib/badge-engine/jamActionBadges'")
    expect(syncSource).toContain("from '@/lib/badge-engine/jamActionProgressTriggers'")
    expect(syncSource).not.toContain("from '@/lib/badge-engine/jamActionRoute'")
  })
})
