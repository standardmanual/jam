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
    expect(postCode).toMatch(/level:/)
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

describe('family_key 불변 (판단 ③)', () => {
  it('PUT의 update 페이로드에 family_key가 없다', () => {
    expect(putCode).not.toMatch(/family_key:\s*body\.family_key/)
    expect(putCode).not.toMatch(/family_key:\s*body\./)
  })
})
