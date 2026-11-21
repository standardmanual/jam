/**
 * 「카드 모양」 섹션·칩 편집기의 가져오기 방향 (티켓 20261121_2113, 상위 20261120_2026)
 *
 * 공용 조각(`ChoiceField`·`ChoiceOption`·`stampSlotLabel`)은 `FeedFieldParts.tsx`에 있고, `FeedChipsEditor.tsx`는 그것만 가져온다.
 * `FeedCardSection.tsx`가 `FeedChipsEditor.tsx`를 가져오므로 반대 방향 가져오기가 생기면 순환이다 — 소스의 import 줄로 지킨다.
 * `FeedCardSection.tsx`는 기존 이름을 다시 내보내 외부 가져오기가 그대로 동작한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/FeedFieldParts.imports.test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import * as Parts from '../FeedFieldParts'
import * as Section from '../FeedCardSection'

const DIR = join(__dirname, '..')

/** 파일이 상대 경로로 가져오는 모듈 이름들(`from './X'`). */
function relativeImports(file: string): string[] {
  const source = readFileSync(join(DIR, file), 'utf8')
  return [...source.matchAll(/from\s+'(\.\/[^']+)'/g)].map((match) => match[1])
}

describe('공용 조각 파일의 가져오기 방향', () => {
  it('FeedFieldParts는 같은 폴더의 어느 파일도 가져오지 않는다(맨 아래 층)', () => {
    expect(relativeImports('FeedFieldParts.tsx')).toEqual([])
  })

  it('FeedChipsEditor는 공용 조각만 가져오고 FeedCardSection을 가져오지 않는다', () => {
    const imports = relativeImports('FeedChipsEditor.tsx')
    expect(imports).toContain('./FeedFieldParts')
    expect(imports).not.toContain('./FeedCardSection')
  })

  it('FeedCardSection은 공용 조각을 가져오고 FeedChipsEditor를 가져온다(한 방향)', () => {
    const imports = relativeImports('FeedCardSection.tsx')
    expect(imports).toContain('./FeedFieldParts')
    expect(imports).toContain('./FeedChipsEditor')
  })
})

describe('FeedCardSection의 다시 내보내기', () => {
  it('기존 가져오기 이름이 공용 조각과 같은 값이다', () => {
    expect(Section.ChoiceField).toBe(Parts.ChoiceField)
    expect(Section.stampSlotLabel).toBe(Parts.stampSlotLabel)
  })
})
