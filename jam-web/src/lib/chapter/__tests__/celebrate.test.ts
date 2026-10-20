/**
 * 챕터 오름 축하 판정 (티켓 20261019_1317 1회, 사용자 결정 1)
 *
 * 고정하는 것: 저장값이 없으면 연출 없이 저장만 · 지금 챕터가 1 이하면 연출 없음 · 저장값보다 높으면 가장 높은 챕터를 한 번 · 저장값 이상이면 아무것도 하지 않음 ·
 * 저장소가 막혀 있거나(읽기·쓰기가 던짐) 쓴 값이 남지 않으면 연출하지 않음 · 다른 오버레이가 열려 있으면 저장하지 않고 기다림 · 유저마다 따로 저장.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/celebrate.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  chapterCelebratedKey,
  claimChapterRise,
  decideCelebration,
  parseChapterNo,
  readCelebratedChapter,
  writeCelebratedChapter,
  type StorageLike,
} from '../celebrate'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

/** 접근할 때마다 던지는 저장소 (저장 공간 차단) */
const BLOCKED: StorageLike = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

/** 읽기는 되는데 쓰기가 던지는 저장소 (용량 초과) */
function readOnlyStorage(initial: Record<string, string> = {}): StorageLike {
  return {
    getItem: (key) => initial[key] ?? null,
    setItem() {
      throw new Error('QuotaExceededError')
    },
  }
}

/** 쓰기는 조용히 버리는 저장소 (일부 사생활 보호 모드) */
function forgetfulStorage(): StorageLike {
  return { getItem: () => null, setItem: () => {} }
}

describe('parseChapterNo', () => {
  it('1 이상의 정수만 챕터 번호로 읽는다', () => {
    expect(parseChapterNo(3)).toBe(3)
    expect(parseChapterNo('3')).toBe(3)
    expect(parseChapterNo('12')).toBe(12)
  })

  it('없음·0·음수·소수·문자·손상된 값은 null이다', () => {
    for (const raw of [null, undefined, 0, -1, 1.5, NaN, '0', '-2', '3.5', '3a', '', ' 3', 'abc', {}, [], true]) {
      expect(parseChapterNo(raw), String(raw)).toBeNull()
    }
  })
})

describe('decideCelebration', () => {
  it('저장값이 없으면 연출 없이 지금 챕터를 저장만 한다', () => {
    expect(decideCelebration(5, null)).toEqual({ celebrate: null, save: 5 })
    expect(decideCelebration(2, null)).toEqual({ celebrate: null, save: 2 })
  })

  it('지금 챕터가 1이면 연출하지 않는다', () => {
    expect(decideCelebration(1, null)).toEqual({ celebrate: null, save: 1 })
    expect(decideCelebration(1, 1)).toEqual({ celebrate: null, save: null })
  })

  it('저장값보다 높으면 지금(가장 높은) 챕터를 한 번 보이고 저장한다', () => {
    expect(decideCelebration(3, 2)).toEqual({ celebrate: 3, save: 3 })
    // 한 번에 여러 챕터를 넘어도 가장 높은 챕터 하나다
    expect(decideCelebration(7, 2)).toEqual({ celebrate: 7, save: 7 })
    expect(decideCelebration(2, 1)).toEqual({ celebrate: 2, save: 2 })
  })

  it('저장값 이상이면 연출도 저장도 하지 않는다(저장값을 낮추지 않는다)', () => {
    expect(decideCelebration(3, 3)).toEqual({ celebrate: null, save: null })
    expect(decideCelebration(3, 5)).toEqual({ celebrate: null, save: null })
  })

  it('챕터가 없거나 손상된 값이면 아무것도 하지 않는다', () => {
    for (const current of [null, 0, -1, 2.5, NaN]) {
      expect(decideCelebration(current, 2), String(current)).toEqual({ celebrate: null, save: null })
    }
  })
})

describe('저장소 읽기·쓰기', () => {
  it('유저마다 다른 키를 쓴다', () => {
    expect(chapterCelebratedKey('u1')).not.toBe(chapterCelebratedKey('u2'))
    expect(chapterCelebratedKey('u1')).toContain('u1')
  })

  it('읽기: 값이 있으면 읽고 없거나 손상됐으면 null, 저장소가 막혀 있으면 ok:false', () => {
    const storage = new MemoryStorage()
    expect(readCelebratedChapter(storage, 'u1')).toEqual({ ok: true, value: null })
    storage.setItem(chapterCelebratedKey('u1'), '4')
    expect(readCelebratedChapter(storage, 'u1')).toEqual({ ok: true, value: 4 })
    storage.setItem(chapterCelebratedKey('u1'), 'abc')
    expect(readCelebratedChapter(storage, 'u1')).toEqual({ ok: true, value: null })
    expect(readCelebratedChapter(BLOCKED, 'u1')).toEqual({ ok: false })
    expect(readCelebratedChapter(null, 'u1')).toEqual({ ok: false })
  })

  it('쓰기: 남았는지 다시 읽어 확인하고, 던지거나 값이 남지 않으면 false', () => {
    const storage = new MemoryStorage()
    expect(writeCelebratedChapter(storage, 'u1', 3)).toBe(true)
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('3')
    expect(writeCelebratedChapter(BLOCKED, 'u1', 3)).toBe(false)
    expect(writeCelebratedChapter(readOnlyStorage(), 'u1', 3)).toBe(false)
    expect(writeCelebratedChapter(forgetfulStorage(), 'u1', 3)).toBe(false)
    expect(writeCelebratedChapter(null, 'u1', 3)).toBe(false)
  })
})

describe('claimChapterRise', () => {
  const base = { userId: 'u1', blocked: false }

  it('저장값이 없으면 연출 없이 저장만 한다(처음 보는 기기)', () => {
    const storage = new MemoryStorage()
    expect(claimChapterRise({ ...base, storage, chapterNo: 5 })).toEqual({ kind: 'none' })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('5')
  })

  it('저장값보다 높으면 저장하고 가장 높은 챕터로 연출한다', () => {
    const storage = new MemoryStorage()
    storage.setItem(chapterCelebratedKey('u1'), '2')
    expect(claimChapterRise({ ...base, storage, chapterNo: 4 })).toEqual({ kind: 'celebrate', chapterNo: 4 })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('4')
  })

  it('한 번 띄운 뒤 같은 챕터로 다시 열면 연출하지 않는다(한 번만)', () => {
    const storage = new MemoryStorage()
    storage.setItem(chapterCelebratedKey('u1'), '2')
    expect(claimChapterRise({ ...base, storage, chapterNo: 3 }).kind).toBe('celebrate')
    expect(claimChapterRise({ ...base, storage, chapterNo: 3 })).toEqual({ kind: 'none' })
  })

  it('챕터 1은 저장만 하고 연출하지 않으며, 다음 챕터 2에서 연출한다', () => {
    const storage = new MemoryStorage()
    expect(claimChapterRise({ ...base, storage, chapterNo: 1 })).toEqual({ kind: 'none' })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('1')
    expect(claimChapterRise({ ...base, storage, chapterNo: 2 })).toEqual({ kind: 'celebrate', chapterNo: 2 })
  })

  it('다른 오버레이가 열려 있으면 기다리고 저장하지 않는다. 닫힌 뒤 다시 부르면 연출한다', () => {
    const storage = new MemoryStorage()
    storage.setItem(chapterCelebratedKey('u1'), '2')
    expect(claimChapterRise({ ...base, storage, chapterNo: 3, blocked: true })).toEqual({ kind: 'wait' })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('2')
    expect(claimChapterRise({ ...base, storage, chapterNo: 3, blocked: false })).toEqual({ kind: 'celebrate', chapterNo: 3 })
  })

  it('연출할 것이 없으면 다른 오버레이가 열려 있어도 기다리지 않는다', () => {
    const storage = new MemoryStorage()
    storage.setItem(chapterCelebratedKey('u1'), '3')
    expect(claimChapterRise({ ...base, storage, chapterNo: 3, blocked: true })).toEqual({ kind: 'none' })
  })

  it('저장소가 막혀 있으면 연출하지 않는다(읽기 실패)', () => {
    expect(claimChapterRise({ ...base, storage: BLOCKED, chapterNo: 4 })).toEqual({ kind: 'none' })
    expect(claimChapterRise({ ...base, storage: null, chapterNo: 4 })).toEqual({ kind: 'none' })
  })

  it('읽을 수는 있어도 쓸 수 없으면 연출하지 않는다(매번 뜨면 안 된다)', () => {
    const key = chapterCelebratedKey('u1')
    expect(claimChapterRise({ ...base, storage: readOnlyStorage({ [key]: '2' }), chapterNo: 4 })).toEqual({ kind: 'none' })
    expect(claimChapterRise({ ...base, storage: forgetfulStorage(), chapterNo: 4 })).toEqual({ kind: 'none' })
  })

  it('유저마다 따로 저장한다 — 다른 계정의 저장값은 영향을 주지 않는다', () => {
    const storage = new MemoryStorage()
    storage.setItem(chapterCelebratedKey('u1'), '5')
    // u2는 저장값이 없으니 연출 없이 저장만
    expect(claimChapterRise({ ...base, userId: 'u2', storage, chapterNo: 4 })).toEqual({ kind: 'none' })
    expect(storage.map.get(chapterCelebratedKey('u2'))).toBe('4')
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('5')
  })
})
