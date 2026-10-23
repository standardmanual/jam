/**
 * 어드민 배지 저장 라우트 — 계약 회귀 테스트 (티켓 20260905_0032 A-1 · A-3)
 *
 * 이 라우트에는 세 가지 계약이 있다. 셋 다 «없어도 조용히 통과»하는 종류라 소스를 스캔해
 * 고정한다(같은 저장소의 `api/admin/strava-backfill/__tests__/route-contract.test.ts`와
 * 같은 방식):
 *
 * 1. **레벨형 배지를 만들 수 있다** — 예전 `if (!name || ... || !rarity || ...)`가 400을 냈다.
 *    레벨형은 `rarity IS NULL`이라 **생성 자체가 불가능**했다.
 * 2. **등급/레벨 배타와 조건 형태 오류를 저장 시점에 막는다** — 판정 함수는 이미 있었고,
 *    라우트가 부르지 않는 것이 문제였다.
 * 3. **`family_key`는 수정하지 않는다** — 2단 교차 게이트가 이 키로 계열을 가리키므로
 *    이름을 고쳐도 키가 바뀌면 게이트 참조가 조용히 끊긴다(티켓 20260905_0032 판단 ③).
 *
 * 실행: `npx vitest run src/app/api/admin/badges/__tests__/route-contract.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 주석에 적힌 단어가 검사를 통과/실패시키지 않도록 코드만 남긴다 */
function codeOf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const postCode = codeOf('src/app/api/admin/badges/route.ts')
const putCode = codeOf('src/app/api/admin/badges/[id]/route.ts')
// insert 페이로드 매핑은 등록 스크립트와 공용인 순수 함수로 옮겼다(티켓 20260925_0541 (b)).
// 매핑 키를 확인하는 검사는 이 파일을 읽고, 라우트가 그 함수를 부르는지는 아래에서 따로 확인한다.
const payloadCode = codeOf('src/lib/admin/badge-insert-payload.ts')

describe('④ 레벨형 배지를 생성할 수 있다', () => {
  it('POST의 필수 필드 검사가 rarity를 요구하지 않는다', () => {
    const required = postCode.match(/if \(!name[^)]*\)/)
    expect(required).not.toBeNull()
    expect(required![0]).not.toContain('!rarity')
    // 나머지 필수 필드는 그대로다(회귀 방지)
    for (const field of ['!name', '!description', '!type', '!image_url']) {
      expect(required![0]).toContain(field)
    }
  })

  it('POST가 level을 body에서 읽어 insert 페이로드에 넣는다', () => {
    expect(postCode).toMatch(/const \{[^}]*\blevel\b[^}]*\} = body/)
    expect(payloadCode).toMatch(/const \{[^}]*\blevel\b[^}]*\} = body/)
    expect(payloadCode).toMatch(/level:/)
  })

  it('PUT이 level을 병합해 저장한다 — 등급형 ↔ 레벨형 전환이 가능해야 한다', () => {
    expect(putCode).toMatch(/body\.level/)
    expect(putCode).toMatch(/\blevel,/)
  })
})

describe('⑤ 등급/레벨 배타를 사람이 읽을 수 있는 메시지로 막는다', () => {
  it('POST·PUT 모두 findRarityLevelError를 호출한다', () => {
    for (const code of [postCode, putCode]) {
      expect(code).toMatch(/import\s*\{[^}]*\bfindRarityLevelError\b[^}]*\}\s*from\s*'@\/lib\/admin\/badge-validation'/)
      expect(code).toMatch(/findRarityLevelError\(/)
    }
  })
})

describe('①②③ 조건 형태 검사를 저장 시점에 돌린다', () => {
  it('POST·PUT 모두 findBadgeConditionSaveError를 호출한다', () => {
    for (const code of [postCode, putCode]) {
      expect(code).toMatch(
        /import\s*\{[^}]*\bfindBadgeConditionSaveError\b[^}]*\}\s*from\s*'@\/lib\/admin\/badge-validation'/
      )
      expect(code).toMatch(/findBadgeConditionSaveError\(/)
    }
  })

  it('판정을 라우트 안에 복사하지 않는다 — 발급 엔진과 같은 함수를 써야 한다', () => {
    for (const code of [postCode, putCode]) {
      for (const forbidden of ['normalizeRequirement', 'REST_CONDITION_KEYS', 'PAIR_ENFORCED_CONDITION_KEYS']) {
        expect(code).not.toContain(forbidden)
      }
    }
  })
})

describe('⑦ 회차 조건 경고 — 저장은 허용하고 응답 warning으로 알린다 (티켓 20261021_1426)', () => {
  it('POST·PUT 모두 findConditionShapeSaveWarning을 badge-validation에서 가져와 부른다', () => {
    for (const code of [postCode, putCode]) {
      expect(code).toMatch(
        /import\s*\{[^}]*\bfindConditionShapeSaveWarning\b[^}]*\}\s*from\s*'@\/lib\/admin\/badge-validation'/
      )
      expect(code).toMatch(/findConditionShapeSaveWarning\(/)
    }
  })

  it('경고는 저장이 끝난 뒤 응답에만 싣는다 — 저장을 막는 분기(status 400)에 쓰지 않는다', () => {
    for (const code of [postCode, putCode]) {
      expect(code).toMatch(/\{\s*badge:\s*data,\s*warning\s*\}/)
      const saveCall = Math.max(code.indexOf('.insert('), code.indexOf('.update('))
      expect(saveCall).toBeGreaterThan(-1)
      expect(code.indexOf('findConditionShapeSaveWarning(')).toBeGreaterThan(saveCall)
    }
  })

  it('경고 판정을 라우트 안에 복사하지 않는다 — 엔진의 unconsumedRepeatConditionKeys는 가드 파일만 부른다', () => {
    for (const code of [postCode, putCode]) {
      expect(code).not.toContain('unconsumedRepeatConditionKeys')
    }
  })
})

describe('family_key 불변 (판단 ③)', () => {
  it('PUT의 update 페이로드에 family_key가 없다', () => {
    expect(putCode).not.toMatch(/family_key:\s*body\.family_key/)
    expect(putCode).not.toMatch(/family_key:\s*body\./)
  })
})

describe('⑥ admin_category — 어드민 전용 분류(JAM!), type과 무관하게 저장 (티켓 20260910_2055)', () => {
  it('POST가 admin_category를 body에서 읽어 insert 페이로드에 넣는다', () => {
    expect(payloadCode).toMatch(/const \{[^}]*\badmin_category\b[^}]*\} = body/)
    expect(payloadCode).toMatch(/admin_category:/)
  })

  it("POST(공용 매핑)·PUT의 admin_category 저장 줄에는 category처럼 type==='checkin' 가드가 없다", () => {
    for (const code of [payloadCode, putCode]) {
      const line = code.match(/admin_category:[^\n]*/)
      expect(line).not.toBeNull()
      expect(line![0]).not.toContain("type === 'checkin'")
    }
  })

  it('PUT이 admin_category를 병합한다 — body에 없으면(undefined) 기존 값을 유지한다', () => {
    expect(putCode).toMatch(/admin_category:\s*body\.admin_category\s*!==\s*undefined\s*\?\s*body\.admin_category\s*:\s*existing\.admin_category/)
  })
})

describe('기존 category(지점 카테고리) 가드는 admin_category 추가로 건드리지 않는다', () => {
  it("POST(공용 매핑)·PUT 모두 category는 여전히 type === 'checkin'일 때만 저장한다", () => {
    for (const code of [payloadCode, putCode]) {
      expect(code).toMatch(/category:\s*type === 'checkin'/)
    }
  })
})

describe('POST의 insert 페이로드는 공용 순수 함수가 만든다 (티켓 20260925_0541 (b))', () => {
  it('라우트가 badge-insert-payload의 buildBadgeInsertPayload를 불러 그 결과를 insert한다', () => {
    expect(postCode).toMatch(
      /import\s*\{[^}]*\bbuildBadgeInsertPayload\b[^}]*\}\s*from\s*'@\/lib\/admin\/badge-insert-payload'/
    )
    expect(postCode).toMatch(/const insertPayload = buildBadgeInsertPayload\(body\)/)
    expect(postCode).toMatch(/\.insert\(insertPayload\)/)
  })

  it('매핑을 라우트 안에 다시 인라인하지 않는다 — 원본은 순수 함수 한 곳이다', () => {
    expect(postCode).not.toMatch(/const insertPayload = \{/)
  })
})
