/**
 * 합친 연출의 표시 모델 (티켓 20261028_1740 1회)
 *
 * 고정하는 것: 빈 입력 → null / 오름 없음 → full / 오름 있음 → chapter N / 연속 오름 [2, 3] → 3 / 쌓인 여러 동기화 중 최댓값 /
 * 도달 챕터가 1뿐이면 full / 오르기 전 챕터(`chapterNo`)와 `chapterCount`를 읽지 않음 / 보상 개수(잠긴 개체 포함, 챕터 배지 맨 끝,
 * 중복 openId 한 번) / 입력 배열을 바꾸지 않음 / 원 좌표를 루트 기준으로 바꾸는 `toRootOrigin`.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/result-overlay-model.test.ts
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCapsuleResultView, originClip, toRootOrigin, type CapsuleResultEventInput } from '../result-overlay-model'

interface TestItem {
  id: string
  locked?: boolean
}

function event(openId: string, itemIds: string[], reachedChapters: number[] = [], extra: Record<string, unknown> = {}): CapsuleResultEventInput<TestItem> {
  return { openId, items: itemIds.map((id) => ({ id })), reachedChapters, ...extra }
}

describe('buildCapsuleResultView — 제목', () => {
  it('이벤트가 없으면 null이다(챕터 배지가 있어도 그리지 않는다)', () => {
    expect(buildCapsuleResultView<TestItem, string>([], [])).toBeNull()
    expect(buildCapsuleResultView<TestItem, string>([], ['badge'])).toBeNull()
  })

  it('오른 챕터가 없으면 full이고 chapterNo가 없다', () => {
    const view = buildCapsuleResultView([event('o1', ['a'])], [])
    expect(view?.titleKind).toBe('full')
    expect(view && 'chapterNo' in view).toBe(false)
  })

  it('오른 챕터가 있으면 chapter와 그 번호다', () => {
    const view = buildCapsuleResultView([event('o1', ['a'], [4])], [])
    expect(view).toMatchObject({ titleKind: 'chapter', chapterNo: 4 })
  })

  it('연속 오름 [2, 3]은 가장 높은 챕터 하나다', () => {
    const view = buildCapsuleResultView([event('o1', ['a'], [2, 3])], [])
    expect(view).toMatchObject({ titleKind: 'chapter', chapterNo: 3 })
  })

  it('이벤트가 여럿이면 도달 챕터 전체의 최댓값이고 이벤트 순서와 무관하다', () => {
    const asc = buildCapsuleResultView([event('o1', [], [2]), event('o2', [], [3]), event('o3', [], [])], [])
    const desc = buildCapsuleResultView([event('o3', [], [5]), event('o2', [], [3]), event('o1', [], [2])], [])
    expect(asc).toMatchObject({ titleKind: 'chapter', chapterNo: 3 })
    expect(desc).toMatchObject({ titleKind: 'chapter', chapterNo: 5 })
  })

  it('도달 챕터가 1뿐이면 오른 것이 아니라 시작이라 full이다', () => {
    const view = buildCapsuleResultView([event('o1', ['a'], [1])], [])
    expect(view?.titleKind).toBe('full')
  })

  it('1과 2 이상이 섞이면 2 이상의 최댓값이다', () => {
    expect(buildCapsuleResultView([event('o1', [], [1, 2])], [])).toMatchObject({ titleKind: 'chapter', chapterNo: 2 })
  })

  it('오르기 전 챕터(chapterNo)와 센 뒤의 횟수(chapterCount)를 읽지 않는다', () => {
    // 서버 이벤트에는 chapterNo가 «오르기 전 챕터»로 들어 있다. 이 값에 1을 더해 제목을 만들면 안 된다.
    const withNoise = buildCapsuleResultView([event('o1', ['a'], [], { chapterNo: 7, chapterCount: 3 })], [])
    expect(withNoise?.titleKind).toBe('full')
    const rose = buildCapsuleResultView([event('o1', ['a'], [3], { chapterNo: 7, chapterCount: 0 })], [])
    expect(rose).toMatchObject({ titleKind: 'chapter', chapterNo: 3 })
  })
})

describe('buildCapsuleResultView — 보상', () => {
  it('개체가 없고 챕터 배지도 없으면 보상이 없다', () => {
    const view = buildCapsuleResultView([event('o1', [])], [])
    expect(view).toMatchObject({ rewardCount: 0, hasRewards: false, rewards: [] })
  })

  it('챕터 배지만 있어도 보상이 있다', () => {
    const view = buildCapsuleResultView([event('o1', [], [2])], ['chapter-2'])
    expect(view).toMatchObject({ rewardCount: 1, hasRewards: true })
  })

  it('개체 수의 합에 챕터 배지 수를 더한다', () => {
    const view = buildCapsuleResultView([event('o1', ['a', 'b']), event('o2', ['c'])], ['ch'])
    expect(view?.rewardCount).toBe(4)
  })

  it('잠긴 개체도 1개로 센다', () => {
    const locked: CapsuleResultEventInput<TestItem> = { openId: 'o1', items: [{ id: 'a', locked: true }, { id: 'b' }], reachedChapters: [] }
    expect(buildCapsuleResultView([locked], [])?.rewardCount).toBe(2)
  })

  it('이벤트 순서대로 개체를 늘어놓고 챕터 배지를 맨 끝에 둔다', () => {
    const view = buildCapsuleResultView([event('o1', ['a', 'b']), event('o2', ['c'])], ['ch-2', 'ch-3'])
    expect(view?.rewards.map((r) => (r.kind === 'item' ? r.item.id : r.badge))).toEqual(['a', 'b', 'c', 'ch-2', 'ch-3'])
    expect(view?.rewards.map((r) => r.kind)).toEqual(['item', 'item', 'item', 'chapterBadge', 'chapterBadge'])
  })

  it('이벤트 순서를 화면에서 다시 정렬하지 않는다(openId가 뒤섞여 있어도 입력 순서다)', () => {
    const view = buildCapsuleResultView([event('z', ['first']), event('a', ['second'])], [])
    expect(view?.rewards.map((r) => (r.kind === 'item' ? r.item.id : ''))).toEqual(['first', 'second'])
  })

  it('중복 openId는 한 번만 센다', () => {
    const view = buildCapsuleResultView([event('o1', ['a', 'b']), event('o1', ['a', 'b']), event('o2', ['c'])], [])
    expect(view?.rewardCount).toBe(3)
    expect(view?.rewards.map((r) => (r.kind === 'item' ? r.item.id : ''))).toEqual(['a', 'b', 'c'])
  })
})

describe('buildCapsuleResultView — 순수성', () => {
  it('입력 배열과 이벤트를 바꾸지 않는다', () => {
    const events = [event('o1', ['a'], [2, 3]), event('o1', ['a'], [2, 3])]
    const badges = ['ch']
    const snapshot = JSON.stringify({ events, badges })
    Object.freeze(events)
    Object.freeze(badges)
    for (const e of events) {
      Object.freeze(e.items)
      Object.freeze(e.reachedChapters)
    }

    buildCapsuleResultView(events, badges)

    expect(JSON.stringify({ events, badges })).toBe(snapshot)
  })

  it('같은 입력이면 같은 출력이다', () => {
    const events = [event('o1', ['a'], [2])]
    expect(buildCapsuleResultView(events, ['ch'])).toEqual(buildCapsuleResultView(events, ['ch']))
  })

  it('모델 파일은 아무것도 가져오지 않는다(서버 모듈 차단)', () => {
    const source = readFileSync(join(__dirname, '../result-overlay-model.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*(import|export)\s[^;]*\sfrom\s/m)
    expect(source).not.toMatch(/\brequire\s*\(|\bimport\s*\(/)
  })
})

describe('toRootOrigin · originClip', () => {
  const origin = { top: 300, left: 120, width: 200, height: 72, circle: 66 }

  it('뷰포트 좌표에서 루트의 왼쪽 위를 뺀다(데스크톱에서 430px 컬럼이 가운데에 있을 때)', () => {
    const root = toRootOrigin(origin, { left: 485, top: 0 })
    expect(root).toEqual({ top: 300, left: -365, width: 200, height: 72, circle: 66 })
  })

  it('루트가 뷰포트와 같으면 그대로다', () => {
    expect(toRootOrigin(origin, { left: 0, top: 0 })).toEqual(origin)
  })

  it('입력을 바꾸지 않는다', () => {
    const copy = { ...origin }
    toRootOrigin(origin, { left: 10, top: 20 })
    expect(origin).toEqual(copy)
  })

  it('clip-path는 루트 크기에서 자리를 뺀 여백과 높이의 절반 둥글기다', () => {
    expect(originClip(origin, 430, 800)).toBe('inset(300px 110px 428px 120px round 36px)')
  })

  it('자리가 루트 밖으로 나가 있어도 여백이 음수가 되지 않는다', () => {
    expect(originClip({ ...origin, left: 300, width: 200 }, 430, 800)).toContain(' 0px ')
  })
})
