/**
 * 어드민 배지 폼 — 숨김·가지 입력 계약 (티켓 20261018_1816 1회)
 *
 * 폼은 클라이언트 컴포넌트라 소스를 스캔해 고정한다(`type-switch-hidden-values-contract.test.ts`와 같은 방식).
 * 규칙 자체(숨김은 액티비티만·포인트 0·Common만, 가지 일곱 가지)의 판정은 `badge-hidden-guard.test.ts`가 맡는다.
 *
 * 1. 숨김을 켜면 등급은 Common, 포인트는 0으로 맞춘다.
 * 2. 액티비티 밖으로 타입을 바꾸면 숨김·가지를 비운다.
 * 3. 저장 전에 저장 라우트와 같은 함수(`findHiddenBadgeError`)로 막고, 저장 본문에 두 칸을 싣는다.
 * 4. 숨김이면 등급 선택지는 Common뿐이고 포인트 입력은 잠긴다.
 * 5. 기한 칸은 두지 않는다. 공개 기간(시작·종료 시각)만 있다.
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/hidden-branch-form-contract.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FORM = readFileSync(join(__dirname, '..', 'BadgeForm.tsx'), 'utf-8')

/** 함수 본문만 떼어낸다 — 다른 함수의 같은 줄로 통과하지 않게 한다 */
function bodyOf(source: string, header: string): string {
  const start = source.indexOf(header)
  expect(start, `${header}를 찾지 못했다`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n  }\n', start)
  return source.slice(start, end)
}

describe('숨김·가지 입력', () => {
  it('숨김을 켜면 등급을 Common으로, 포인트를 0으로 맞춘다', () => {
    const body = bodyOf(FORM, 'const changeHidden = (next: boolean) => {')
    expect(body).toMatch(/setRarity\('common'\)/)
    expect(body).toMatch(/setPointReward\('0'\)/)
  })

  it('액티비티 밖으로 바꾸면 숨김·가지를 비운다', () => {
    const body = bodyOf(FORM, 'const changeType = (next: BadgeType) => {')
    expect(body).toMatch(/if \(next !== 'activity'\) \{\s*setIsHidden\(false\)\s*setBranchKey\(''\)/)
  })

  it('저장 전에 저장 라우트와 같은 검증 함수로 막고, 본문에 숨김·가지를 싣는다', () => {
    const body = bodyOf(FORM, 'const handleSubmit = async (e: React.FormEvent) => {')
    expect(body).toMatch(/findHiddenBadgeError\(\{/)
    expect(body).toMatch(/is_hidden: isHidden/)
    expect(body).toMatch(/branch_key: isBranchKey\(branchKey\) \? branchKey : null/)
  })

  it('숨김이면 등급 선택지는 Common뿐이고 포인트 입력은 잠긴다', () => {
    expect(FORM).toMatch(/\(isHidden \? \(\['common'\] as BadgeRarity\[\]\) : RARITIES\)/)
    expect(FORM).toMatch(/id="badge-point-reward"[\s\S]{0,300}disabled=\{isHidden\}/)
  })

  it('숨김·가지 입력은 액티비티 배지에서만 보인다', () => {
    expect(FORM).toMatch(/\{type === 'activity' && \(\s*<div className="flex min-w-0 flex-col gap-1\.5">\s*<FieldLabel htmlFor="badge-branch-key"/)
    expect(FORM).toMatch(/\{type === 'activity' && \(\s*<div className=\{cn\('flex min-w-0 flex-col gap-1\.5', fieldSpanClass\(2\)\)\}>\s*<FieldLabel htmlFor="badge-is-hidden"/)
  })
})

describe('기한 칸이 없다', () => {
  it('폼에 «기한» 입력이 없고 공개 기간(시작·종료 시각)만 있다', () => {
    expect(FORM).not.toMatch(/기한/)
    expect(FORM).toMatch(/aria-label="시작 시각"/)
    expect(FORM).toMatch(/aria-label="종료 시각"/)
    expect(FORM).not.toMatch(/expires_at|expire_days|expiry/)
  })
})
