import { missionStatusKind } from './missionStatusKind'

const f = { done: false, locked: false, joined: false }

describe('missionStatusKind — 상단 상태 라벨 우선순위', () => {
  it('완료 > 잠김 > 참가중 > 시작 전 > 기간 순으로 고른다', () => {
    expect(missionStatusKind({ done: true, locked: true, joined: true }, false)).toBe('done')
    expect(missionStatusKind({ ...f, locked: true, joined: true }, false)).toBe('locked')
    expect(missionStatusKind({ ...f, joined: true }, false)).toBe('joined')
    expect(missionStatusKind(f, false)).toBe('upcoming')
    expect(missionStatusKind(f, true)).toBe('period')
  })

  it('시작 전이어도 완료·잠김이 먼저다', () => {
    expect(missionStatusKind({ ...f, done: true }, false)).toBe('done')
    expect(missionStatusKind({ ...f, locked: true }, false)).toBe('locked')
  })
})
