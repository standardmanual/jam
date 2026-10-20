/**
 * 챕터 오름 감시 (티켓 20261019_1317 1회, 사용자 결정 1 «다음에 앱을 열 때 한 번»)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 훅(`useEffect`·`useRef`·`useState`)을 바꿔 컴포넌트 함수를 직접 부르고,
 * 모은 효과를 손으로 돌린다(`TodayCardTracker.test.tsx`와 같은 방식). `localStorage`·`fetch`는 가짜로 대신한다.
 *
 * 확인하는 것: ① 저장값보다 높으면 이름을 읽어 한 번 띄우고 저장한다 ② 저장값이 없으면 연출 없이 저장만 한다
 * ③ 다른 오버레이가 열려 있으면 저장 없이 기다리고, 닫힌 뒤 다시 돌면 띄운다 ④ 저장소가 막혀 있으면 띄우지 않는다
 * ⑤ 같은 챕터로 효과가 다시 돌아도 한 번만 처리한다 ⑥ 이름 읽기가 실패·지연·다른 챕터면 이름 없이 띄운다.
 *
 * 실행: cd jam-web && npx vitest run src/components/chapter/__tests__/ChapterRiseWatcher.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chapterCelebratedKey } from '@/lib/chapter/celebrate'

const effects: (() => void | (() => void))[] = []
const refHolder: { current: unknown } = { current: null }
const setRise = vi.fn()
const overlay = { hidden: false }

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useRef: () => refHolder,
    useEffect: (effect: () => void | (() => void)) => {
      effects.push(effect)
    },
    useState: (initial: unknown) => [initial, setRise],
    useCallback: (fn: unknown) => fn,
  }
})
vi.mock('@/lib/uiOverlay', () => ({
  useTabBarHidden: () => overlay.hidden,
}))
vi.mock('@/components/chapter/ChapterRiseOverlay', () => ({ default: () => null }))

import ChapterRiseWatcher, { fetchRiseName } from '../ChapterRiseWatcher'

class MemoryStorage {
  readonly map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

let storage: MemoryStorage
const fetchMock = vi.fn()

function okResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

/** 컴포넌트를 한 번 그리고 모인 효과를 돌린다 */
async function renderAndRun(chapterNo: number, userId = 'u1') {
  effects.length = 0
  ChapterRiseWatcher({ chapterNo, userId })
  for (const effect of effects) effect()
  // fetch → then 체인이 끝나도록 마이크로태스크를 비운다
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  effects.length = 0
  refHolder.current = null
  overlay.hidden = false
  setRise.mockReset()
  fetchMock.mockReset()
  storage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage: storage })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChapterRiseWatcher', () => {
  it('저장값보다 높으면 이름을 읽어 한 번 띄우고 저장한다', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '2')
    fetchMock.mockResolvedValue(okResponse({ chapterNo: 3, name: '단골' }))

    await renderAndRun(3)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chapter/me')
    expect(setRise).toHaveBeenCalledTimes(1)
    expect(setRise).toHaveBeenCalledWith({ chapterNo: 3, name: '단골' })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('3')
  })

  it('저장값이 없으면 연출 없이 저장만 하고 이름도 읽지 않는다(처음 보는 기기)', async () => {
    await renderAndRun(5)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(setRise).not.toHaveBeenCalled()
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('5')
  })

  it('저장값과 같으면 아무것도 하지 않는다', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '3')

    await renderAndRun(3)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(setRise).not.toHaveBeenCalled()
  })

  it('다른 오버레이가 열려 있으면 저장 없이 기다리고, 닫힌 뒤 효과가 다시 돌면 띄운다', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '2')
    fetchMock.mockResolvedValue(okResponse({ chapterNo: 3, name: null }))
    overlay.hidden = true

    await renderAndRun(3)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(setRise).not.toHaveBeenCalled()
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('2')

    overlay.hidden = false
    await renderAndRun(3)
    expect(setRise).toHaveBeenCalledWith({ chapterNo: 3, name: null })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('3')
  })

  it('저장소가 막혀 있으면 띄우지 않는다', async () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('SecurityError')
      },
    })

    await renderAndRun(4)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(setRise).not.toHaveBeenCalled()
  })

  it('저장소에 쓸 수 없으면 띄우지 않는다(매번 뜨면 안 된다)', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '2')
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    await renderAndRun(3)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(setRise).not.toHaveBeenCalled()
  })

  it('같은 챕터로 효과가 다시 돌아도 한 번만 처리한다(연출이 열리면 탭바 숨김이 바뀌어 효과가 다시 돈다)', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '2')
    fetchMock.mockResolvedValue(okResponse({ chapterNo: 3, name: '단골' }))

    await renderAndRun(3)
    overlay.hidden = true
    await renderAndRun(3)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setRise).toHaveBeenCalledTimes(1)
  })

  it('이름 읽기가 실패해도 이름 없이 띄운다', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '2')
    fetchMock.mockRejectedValue(new Error('network'))

    await renderAndRun(3)

    expect(setRise).toHaveBeenCalledWith({ chapterNo: 3, name: null })
  })

  it('동기화로 챕터가 또 오르면(새 chapterNo) 가장 높은 챕터로 다시 한 번 띄운다', async () => {
    storage.setItem(chapterCelebratedKey('u1'), '2')
    fetchMock.mockResolvedValueOnce(okResponse({ chapterNo: 3, name: null })).mockResolvedValueOnce(okResponse({ chapterNo: 5, name: '단골' }))

    await renderAndRun(3)
    await renderAndRun(5)

    expect(setRise).toHaveBeenNthCalledWith(1, { chapterNo: 3, name: null })
    expect(setRise).toHaveBeenNthCalledWith(2, { chapterNo: 5, name: '단골' })
    expect(storage.map.get(chapterCelebratedKey('u1'))).toBe('5')
  })
})

describe('fetchRiseName', () => {
  it('응답의 챕터 번호가 같고 이름이 있으면 이름을 돌려준다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ chapterNo: 3, name: '단골' }))
    expect(await fetchRiseName(3, fetchImpl as unknown as typeof fetch)).toBe('단골')
  })

  it('읽는 사이 챕터가 또 올라 번호가 다르면 이름을 쓰지 않는다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ chapterNo: 4, name: '베테랑' }))
    expect(await fetchRiseName(3, fetchImpl as unknown as typeof fetch)).toBeNull()
  })

  it('이름이 없거나 비어 있으면 null이다', async () => {
    for (const name of [null, '', undefined, 7]) {
      const fetchImpl = vi.fn().mockResolvedValue(okResponse({ chapterNo: 3, name }))
      expect(await fetchRiseName(3, fetchImpl as unknown as typeof fetch), String(name)).toBeNull()
    }
  })

  it('실패 응답과 네트워크 오류는 null이다', async () => {
    const failed = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: '실패' }) })
    expect(await fetchRiseName(3, failed as unknown as typeof fetch)).toBeNull()
    const thrown = vi.fn().mockRejectedValue(new Error('network'))
    expect(await fetchRiseName(3, thrown as unknown as typeof fetch)).toBeNull()
  })
})
