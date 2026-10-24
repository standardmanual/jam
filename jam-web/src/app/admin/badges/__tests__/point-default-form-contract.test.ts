/**
 * 어드민 배지 폼 — 포인트 기본값 입력 계약 (티켓 20261022_1135 1회)
 *
 * 폼은 클라이언트 컴포넌트라 소스를 스캔해 고정한다(`hidden-branch-form-contract.test.ts`와 같은 방식).
 * 처음 화면의 값과 칸 안내는 `point-default-form-render.test.tsx`가 서버 렌더로 고정하고, 기본값 계산 자체는 `badge-point-defaults.test.ts`가 맡는다.
 * 이 시험은 «클릭·입력 뒤에 값이 어떻게 움직이는가»를 고정한다.
 *
 * 1. 포인트 칸의 글자는 «사용자가 쓴 글자(pointOverride)가 있으면 그것, 없으면 기본값»이다. 새 배지는 null로 시작해 기본값을 따라가고, 기존 배지는 저장된 값으로 시작해 따라가지 않는다.
 * 2. 기본값은 지금 화면의 등급·레벨형·숨김 state로 계산한다 — 그래서 등급이나 종류를 바꾸면 직접 고치기 전까지 칸이 따라 바뀐다.
 * 3. 칸을 직접 고치면 그 글자를 쓴다(따라가지 않는다). 칸을 비우면 빈 글자 그대로라 기본값으로 되돌아가지 않는다.
 * 4. 숨김은 0으로 고정한다(`changeHidden`). 새 배지는 기본값을 따라가는 상태(null)로 되돌려, 숨김인 동안은 기본값 0이 보이고 숨김을 끄면 등급 기본값이 돌아온다(게이트 WARN 반영). 기존 배지 수정은 입력 글자를 0으로 둔다.
 * 5. 저장 본문·저장 전 검사는 칸에 보이는 글자(`pointReward`)를 읽는다. 일괄 값은 prop(`pointPolicy`)으로만 받는다.
 * 6. 새 배지·기존 배지 수정 페이지가 서버에서 일괄 값을 읽어 폼에 내린다.
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/point-default-form-contract.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FORM = readFileSync(join(__dirname, '..', 'BadgeForm.tsx'), 'utf-8')
const NEW_PAGE = readFileSync(join(__dirname, '..', 'new', 'page.tsx'), 'utf-8')
const EDIT_PAGE = readFileSync(join(__dirname, '..', '[id]', 'edit', 'page.tsx'), 'utf-8')

/** 함수 본문만 떼어낸다 — 다른 함수의 같은 줄로 통과하지 않게 한다 */
function bodyOf(source: string, header: string): string {
  const start = source.indexOf(header)
  expect(start, `${header}를 찾지 못했다`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n  }\n', start)
  return source.slice(start, end)
}

describe('포인트 칸의 글자', () => {
  it('새 배지는 null로 시작하고 기존 배지는 저장된 값(비면 0)으로 시작한다', () => {
    expect(FORM).toMatch(
      /const \[pointOverride, setPointReward\] = useState<string \| null>\(badge \? \(badge\.point_reward\?\.toString\(\) \?\? '0'\) : null\)/
    )
  })

  it('쓴 글자가 있으면 그것, 없으면 기본값이다', () => {
    expect(FORM).toMatch(/const pointReward = pointOverride \?\? String\(pointDefault\)/)
  })

  it('기본값은 지금 화면의 등급·레벨형·숨김으로 계산한다(그래서 등급과 종류를 바꾸면 따라 바뀐다)', () => {
    expect(FORM).toMatch(
      /const pointDefault = defaultPointFor\(\{ rarity: isLeveled \? null : rarity, isLeveled, isHidden \}, pointPolicy\)/
    )
    // 계산에 쓰는 세 값은 모두 state에서 온다 — 상수로 박아 두면 따라가지 않는다
    expect(FORM).toMatch(/const \[rarity, setRarity\] = useState<BadgeRarity>/)
    expect(FORM).toMatch(/const \[isHidden, setIsHidden\] = useState<boolean>/)
    expect(FORM).toMatch(/const isLeveled = type === 'activity' && leveledKind/)
  })

  it('등급·종류 선택은 포인트 칸을 건드리지 않는다(칸은 파생값이 따라간다)', () => {
    expect(FORM).toMatch(/<Select value=\{rarity\} onValueChange=\{\(v\) => setRarity\(v as BadgeRarity\)\}>/)
    expect(FORM).toMatch(/onValueChange=\{\(v\) => setLeveledKind\(v === 'leveled'\)\}/)
    const changeType = bodyOf(FORM, 'const changeType = (next: BadgeType) => {')
    expect(changeType).not.toMatch(/setPointReward/)
  })

  it('칸을 직접 고치면 그 글자를 쓴다(따라가지 않는다)', () => {
    expect(FORM).toMatch(/id="badge-point-reward"[\s\S]{0,300}value=\{pointReward\}[\s\S]{0,100}onChange=\{\(e\) => setPointReward\(e\.target\.value\)\}/)
  })

  it('숨김은 0으로 고정한다: 새 배지는 기본값을 따라가는 상태(null)로 되돌려 숨김을 끄면 등급 기본값이 돌아오고, 기존 배지 수정은 입력 글자를 0으로 둔다', () => {
    const body = bodyOf(FORM, 'const changeHidden = (next: boolean) => {')
    expect(body).toMatch(/setPointReward\(isEdit \? '0' : null\)/)
    // 숨김을 끌 때(next가 false)는 포인트 칸을 건드리지 않는다 — 켤 때 정한 상태가 그대로 남는다
    expect(body).toMatch(/if \(!next\) return\n\s+setRarity\('common'\)/)
  })

  it('저장 본문과 저장 전 검사는 칸에 보이는 글자를 읽는다', () => {
    const body = bodyOf(FORM, 'const handleSubmit = async (e: React.FormEvent) => {')
    expect(body).toContain('findBadgeIntegerInputError({ pointReward, patchAvailable, patchPriceKrw, isLeveled, level })')
    expect(body).toContain('point_reward: Math.max(0, readIntegerInput(pointReward) ?? 0),')
    expect(body).not.toMatch(/pointOverride/)
  })
})

describe('칸 안내', () => {
  it('숨김이 아니면 이 등급(레벨형이면 레벨형)의 기본값을 알린다', () => {
    expect(FORM).toMatch(/const pointDefaultNotice = `\$\{isLeveled \? '레벨형의' : '이 등급의'\} 기본값은 \$\{pointDefault\}포인트예요\.`/)
    expect(FORM).toMatch(/지급하지 않아요\. \$\{pointDefaultNotice\}`/)
  })

  it('숨김이면 기존 안내(0으로 고정)만 보이고 기본값 안내는 붙지 않는다', () => {
    expect(FORM).toMatch(/\{isHidden\s+\? '숨김 배지는 포인트를 지급하지 않아요\. 0으로 고정돼요\.'\s+: `/)
  })
})

describe('일괄 값은 서버에서 읽어 prop으로 내린다', () => {
  it('폼은 일괄 값을 prop으로만 받는다(서버 모듈을 가져오지 않는다)', () => {
    expect(FORM).toMatch(/pointPolicy: BadgePointPolicy/)
    expect(FORM).toMatch(/import type \{ BadgePointPolicy \} from '@\/lib\/badge\/pointPolicy'/)
    expect(FORM).not.toMatch(/import \{[^}]*\} from '@\/lib\/badge\/pointPolicy'/)
    expect(FORM).not.toMatch(/getBadgePointPolicy/)
  })

  it('새 배지·기존 배지 수정 페이지가 getBadgePointPolicy로 읽어 폼에 내린다', () => {
    for (const [name, page] of [
      ['new', NEW_PAGE],
      ['edit', EDIT_PAGE],
    ] as const) {
      expect(page, name).toMatch(/import \{ getBadgePointPolicy \} from '@\/lib\/badge\/pointPolicy'/)
      expect(page, name).toMatch(/const pointPolicy = await getBadgePointPolicy\(supabase\)/)
      expect(page, name).toMatch(/pointPolicy=\{pointPolicy\}/)
    }
  })
})
