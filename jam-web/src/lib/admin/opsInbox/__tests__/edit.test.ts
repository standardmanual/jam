/**
 * 직접 수정 계산 (티켓 20260930_1818)
 *
 * - 고칠 수 없는 경로 거절, 바뀐 칸만 차이로 계산
 * - 앞뒤 적용: 최상위 키 덮어쓰기, 값이 원본과 같아지면 키 제거, 제출 원본은 그대로
 * - 되돌림 스택: 수정 2번 → 되돌림 → 되돌림
 */
import { describe, it, expect } from 'vitest'
import type { Json } from '@/types/database.generated'
import {
  OpsEditError,
  applyDiff,
  computeEditDiff,
  computeRevertDiff,
  findRevertTarget,
  isEditablePath,
  mergeItemForValidation,
  readDiff,
  readEditableValues,
  splitEditPath,
  type OpsEditDiffEntry,
} from '../edit'
import { itemField } from '../itemView'

const ORIGINAL: Json = {
  item_key: 'card-1',
  kind: 'home_feed_card',
  user_experience: '비 오는 월요일 아침에 카드를 만나요',
  starts_at: '2026-10-05T09:00:00+09:00',
  ends_at: '2026-10-06T09:00:00+09:00',
  segment: '전체',
  copy: { title: '우산 챙겨 달리기', body: '오늘은 비가 와요', count: 3 },
  colors: { background: '#1a2b3c', accent: '#ffffff' },
  world_review: { world_related: false, winter_reviewed: false, reason: '운영성 카드예요' },
}

const item = (edited: Json | null = null, original: Json = ORIGINAL) => ({ original, edited })

describe('경로', () => {
  it('고칠 수 있는 경로만 통과한다', () => {
    for (const path of ['user_experience', 'segment', 'starts_at', 'ends_at', 'copy.body', 'colors.background']) {
      expect(isEditablePath(path), path).toBe(true)
    }
    for (const path of ['kind', 'item_key', 'links', 'world_review', 'world_review.reason', 'pattern_no', 'copy', 'copy.', 'colors', 'knobs.x', '']) {
      expect(isEditablePath(path), path).toBe(false)
    }
  })

  it('splitEditPath는 첫 점에서 자른다(키에 점이 있어도 그대로)', () => {
    expect(splitEditPath('copy.body')).toEqual({ root: 'copy', key: 'body' })
    expect(splitEditPath('colors.a.b')).toEqual({ root: 'colors', key: 'a.b' })
    expect(splitEditPath('starts_at')).toBeNull()
  })
})

describe('readEditableValues', () => {
  it('고칠 수 있는 칸과 지금 값을 돌려준다(시각은 UTC ISO, 문자열이 아닌 문안은 빠진다)', () => {
    expect(readEditableValues(item())).toEqual({
      user_experience: '비 오는 월요일 아침에 카드를 만나요',
      segment: '전체',
      starts_at: '2026-10-05T00:00:00.000Z',
      ends_at: '2026-10-06T00:00:00.000Z',
      'copy.title': '우산 챙겨 달리기',
      'copy.body': '오늘은 비가 와요',
      'colors.background': '#1a2b3c',
      'colors.accent': '#ffffff',
    })
  })

  it('수정본이 있으면 수정본 값을 읽는다', () => {
    const values = readEditableValues(item({ user_experience: '바뀐 문장', copy: { title: '새 제목', body: '오늘은 비가 와요', count: 3 } }))
    expect(values.user_experience).toBe('바뀐 문장')
    expect(values['copy.title']).toBe('새 제목')
  })

  it('값이 없거나 읽을 수 없으면 빈 칸이고, 객체로 제출된 대상은 목록에 없다', () => {
    const values = readEditableValues(item(null, { user_experience: '문장', starts_at: '내일 아침', segment: { tier: 'all' } }))
    expect(values.starts_at).toBe('')
    expect(values.ends_at).toBe('')
    expect('segment' in values).toBe(false)
    expect(readEditableValues(item(null, { user_experience: '문장' })).segment).toBe('')
  })
})

describe('computeEditDiff', () => {
  it('바뀐 칸만 [{ path, before, after }]로 돌려준다', () => {
    const diff = computeEditDiff(item(), {
      user_experience: '비 오는 월요일 아침에 카드를 만나요', // 같음
      'copy.title': '새 제목',
      'colors.accent': '#000000',
      starts_at: '2026-10-05T10:00:00+09:00',
    })
    expect(diff).toEqual([
      { path: 'copy.title', before: '우산 챙겨 달리기', after: '새 제목' },
      { path: 'colors.accent', before: '#ffffff', after: '#000000' },
      { path: 'starts_at', before: '2026-10-05T00:00:00.000Z', after: '2026-10-05T01:00:00.000Z' },
    ])
  })

  it('같은 시각이면 표기가 달라도 차이가 아니다', () => {
    expect(computeEditDiff(item(), { starts_at: '2026-10-05T00:00:00Z' })).toEqual([])
  })

  it('고칠 수 없는 경로·없는 문안 키·문자열이 아닌 문안은 거절한다', () => {
    for (const path of ['kind', 'links', 'world_review.reason', 'copy.nope', 'copy.count', 'colors.nope', 'original']) {
      expect(() => computeEditDiff(item(), { [path]: 'x' }), path).toThrow(OpsEditError)
    }
    expect(() => computeEditDiff(item(), { 'copy.title': 3 })).toThrow(OpsEditError)
  })

  it('시각은 시간대가 붙은 ISO여야 하고, 있던 시각은 비울 수 없다', () => {
    expect(() => computeEditDiff(item(), { starts_at: '2026-10-05 09:00' })).toThrow('시각 형식')
    expect(() => computeEditDiff(item(), { ends_at: '' })).toThrow('시각은 비울 수 없어요')
    // 원래 비어 있는 칸을 비운 채 두는 것은 차이가 아니다
    expect(computeEditDiff(item(null, { user_experience: '문장' }), { starts_at: '' })).toEqual([])
    // 던진 오류는 문제가 된 칸을 알려 준다
    try {
      computeEditDiff(item(), { ends_at: '' })
    } catch (error) {
      expect((error as OpsEditError).path).toBe('ends_at')
    }
  })

  it('원본에 없던 대상을 채우면 차이다', () => {
    expect(computeEditDiff(item(null, { user_experience: '문장' }), { segment: '신규 유저' })).toEqual([
      { path: 'segment', before: '', after: '신규 유저' },
    ])
  })
})

describe('applyDiff', () => {
  const diffTitle: OpsEditDiffEntry[] = [{ path: 'copy.title', before: '우산 챙겨 달리기', after: '새 제목' }]

  it('forward: copy는 합친 객체 전체를 넣는다(제출 원본은 바뀌지 않는다)', () => {
    const snapshot = JSON.stringify(ORIGINAL)
    const edited = applyDiff(ORIGINAL, null, diffTitle, 'forward')
    expect(edited).toEqual({ copy: { title: '새 제목', body: '오늘은 비가 와요', count: 3 } })
    expect(JSON.stringify(ORIGINAL)).toBe(snapshot)
  })

  it('backward: 값이 원본과 같아지면 그 키를 뺀다(수정본이 비면 null)', () => {
    const edited = applyDiff(ORIGINAL, null, diffTitle, 'forward')
    expect(applyDiff(ORIGINAL, edited, diffTitle, 'backward')).toBeNull()
  })

  it('한 칸만 되돌려도 다른 수정은 남는다', () => {
    const both: OpsEditDiffEntry[] = [
      ...diffTitle,
      { path: 'user_experience', before: '비 오는 월요일 아침에 카드를 만나요', after: '새 문장' },
    ]
    const edited = applyDiff(ORIGINAL, null, both, 'forward')
    expect(edited).toEqual({ copy: { title: '새 제목', body: '오늘은 비가 와요', count: 3 }, user_experience: '새 문장' })
    expect(applyDiff(ORIGINAL, edited, diffTitle, 'backward')).toEqual({ user_experience: '새 문장' })
  })

  it('시각: 원본과 같은 순간으로 돌아가면 키를 뺀다', () => {
    const moved: OpsEditDiffEntry[] = [{ path: 'starts_at', before: '2026-10-05T00:00:00.000Z', after: '2026-10-05T01:00:00.000Z' }]
    const edited = applyDiff(ORIGINAL, null, moved, 'forward')
    expect(edited).toEqual({ starts_at: '2026-10-05T01:00:00.000Z' })
    expect(applyDiff(ORIGINAL, edited, moved, 'backward')).toBeNull()
  })

  it('원본에 없던 값을 채웠다가 되돌리면 키가 빠진다', () => {
    const original: Json = { user_experience: '문장' }
    const fill: OpsEditDiffEntry[] = [{ path: 'segment', before: '', after: '신규 유저' }]
    const edited = applyDiff(original, null, fill, 'forward')
    expect(edited).toEqual({ segment: '신규 유저' })
    expect(applyDiff(original, edited, fill, 'backward')).toBeNull()
  })

  it('수정 뒤 합친 항목은 수정본이 최상위 키 단위로 원본을 덮는다', () => {
    const edited = applyDiff(ORIGINAL, null, diffTitle, 'forward')
    const merged = mergeItemForValidation(ORIGINAL, edited)
    expect(merged.item_key).toBe('card-1')
    expect(merged.copy).toEqual({ title: '새 제목', body: '오늘은 비가 와요', count: 3 })
    expect(itemField({ original: ORIGINAL, edited }, 'copy')).toEqual(merged.copy)
  })
})

describe('되돌림 스택', () => {
  const at = (n: number) => `2026-10-01T00:0${n}:00Z`
  const editA = { action: 'edit', createdAt: at(1), diff: [{ path: 'copy.title', before: 'A0', after: 'A1' }] }
  const editB = { action: 'edit', createdAt: at(2), diff: [{ path: 'copy.title', before: 'A1', after: 'A2' }] }
  const revert = (n: number) => ({ action: 'revert', createdAt: at(n), diff: [] })

  it('수정이 없으면 null이다', () => {
    expect(findRevertTarget([])).toBeNull()
    expect(findRevertTarget([{ action: 'submit', createdAt: at(0) }, { action: 'approve', createdAt: at(1) }])).toBeNull()
  })

  it('수정 2번 → 되돌림 → 되돌림: 맨 위 수정부터 한 단계씩, 다 되돌리면 null', () => {
    expect(findRevertTarget([editA, editB])).toBe(editB)
    expect(findRevertTarget([editA, editB, revert(3)])).toBe(editA)
    expect(findRevertTarget([editA, editB, revert(3), revert(4)])).toBeNull()
  })

  it('되돌린 뒤 새로 수정하면 그 수정이 대상이다', () => {
    const editC = { action: 'edit', createdAt: at(5), diff: [] }
    expect(findRevertTarget([editA, editB, revert(3), editC])).toBe(editC)
  })

  it('입력이 최신순이어도 같은 결과다', () => {
    expect(findRevertTarget([revert(3), editB, editA])).toBe(editA)
  })

  it('computeRevertDiff: 지금 값에서 대상 수정의 「전」 값으로 가는 칸만 남는다', () => {
    const edited = applyDiff(ORIGINAL, null, [{ path: 'copy.title', before: '우산 챙겨 달리기', after: '새 제목' }], 'forward')
    const target: OpsEditDiffEntry[] = [{ path: 'copy.title', before: '우산 챙겨 달리기', after: '새 제목' }]
    expect(computeRevertDiff(item(edited), target)).toEqual([
      { path: 'copy.title', before: '새 제목', after: '우산 챙겨 달리기' },
    ])
    // 이미 전 값이면 바뀌는 칸이 없다
    expect(computeRevertDiff(item(), target)).toEqual([])
  })

  it('실제 흐름: 수정 2번 → 되돌림 → 되돌림이 제출 원본 상태로 돌아간다', () => {
    const d1: OpsEditDiffEntry[] = [{ path: 'copy.title', before: '우산 챙겨 달리기', after: 'A1' }]
    const e1 = applyDiff(ORIGINAL, null, d1, 'forward')
    const d2: OpsEditDiffEntry[] = [{ path: 'copy.title', before: 'A1', after: 'A2' }]
    const e2 = applyDiff(ORIGINAL, e1, d2, 'forward')
    expect(itemField({ original: ORIGINAL, edited: e2 }, 'copy')).toMatchObject({ title: 'A2' })

    const r1 = computeRevertDiff(item(e2), d2)
    const e3 = applyDiff(ORIGINAL, e2, r1, 'forward')
    expect(itemField({ original: ORIGINAL, edited: e3 }, 'copy')).toMatchObject({ title: 'A1' })

    const r2 = computeRevertDiff(item(e3), d1)
    const e4 = applyDiff(ORIGINAL, e3, r2, 'forward')
    expect(e4).toBeNull()
  })
})

describe('readDiff', () => {
  it('모양이 맞는 줄만 읽는다', () => {
    expect(
      readDiff([
        { path: 'copy.title', before: 'a', after: 'b' },
        { path: 'starts_at', before: null, after: '2026-10-05T01:00:00.000Z' },
        { path: 3, before: 'a', after: 'b' },
        { path: 'x', before: 1, after: 'b' },
        'oops',
      ])
    ).toEqual([
      { path: 'copy.title', before: 'a', after: 'b' },
      { path: 'starts_at', before: null, after: '2026-10-05T01:00:00.000Z' },
    ])
    expect(readDiff(null)).toEqual([])
    expect(readDiff({ path: 'x' })).toEqual([])
  })
})
