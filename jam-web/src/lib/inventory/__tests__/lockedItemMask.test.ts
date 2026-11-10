import { describe, expect, it } from 'vitest'
import { LOCKED_MASK_CHARS, LOCKED_MASK_LENGTH, lockedItemMaskName } from '../lockedItemMask'

describe('lockedItemMaskName — 잠긴 아이템 배지의 가린 이름', () => {
  it('특수문자 6글자다', () => {
    const name = lockedItemMaskName('22222222-2222-4222-8222-222222222222')
    expect([...name]).toHaveLength(LOCKED_MASK_LENGTH)
    expect(LOCKED_MASK_LENGTH).toBe(6)
    for (const ch of name) expect(LOCKED_MASK_CHARS as readonly string[]).toContain(ch)
  })

  it('같은 개체 id는 언제나 같은 이름이다(렌더·새로고침·서버/클라이언트가 같다)', () => {
    const id = 'ff35b3c1-ec5b-4394-ad24-b05e11d33ec6'
    expect(lockedItemMaskName(id)).toBe(lockedItemMaskName(id))
  })

  it('개체마다 다른 이름이 나온다(같은 조합이 우연히 나오는 것은 허용한다)', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => lockedItemMaskName(`item-${i}`)))
    expect(names.size).toBeGreaterThan(150)
  })

  it('13가지 특수문자가 모두 쓰인다', () => {
    const used = new Set<string>()
    for (let i = 0; i < 300; i += 1) for (const ch of lockedItemMaskName(`seed-${i}`)) used.add(ch)
    expect(used.size).toBe(LOCKED_MASK_CHARS.length)
  })

  it('한글·영문·숫자는 섞이지 않는다 — 이름이 아닌 기호로만 읽힌다', () => {
    for (let i = 0; i < 100; i += 1) expect(lockedItemMaskName(`s${i}`)).not.toMatch(/[0-9A-Za-z가-힣]/)
  })
})
