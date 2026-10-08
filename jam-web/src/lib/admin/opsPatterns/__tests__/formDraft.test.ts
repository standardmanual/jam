/**
 * 패턴 폼의 상태 변환 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2)
 *
 * - 시드 모양 레코드 → 초안 → 검사용 입력 → 검사 통과 값이 원래 값과 같다
 * - 깨진 JSONB는 던지지 않고 그 칸만 빈 칸이 된다
 * - 바뀐 칸 세기: 앞뒤 공백만 다른 칸은 세지 않고, 줄 순서가 바뀐 샘플·메뉴는 센다
 * - 오류 경로(`samples.2.role`)가 구역·칸 id로 이어지고 폼 순서로 정렬된다
 */
import { describe, it, expect } from 'vitest'
import {
  changedFields,
  draftFromRecord,
  emptyDraft,
  fieldDomId,
  fieldErrorTarget,
  inputFromDraft,
  orderedErrorPaths,
  type PatternDraft,
} from '../formDraft'
import { validateOpsPatternInput } from '../input'

const RECORD = {
  name: '비 오는 날 카페',
  principle: '비가 오면 카페에서 쓰는 배지를 연다',
  userExperience: '비 오는 날 알림을 받는다',
  menus: ['홈피드', '탐색'],
  samples: [
    { no: 1, name: '첫째 샘플', role: 'main', impl: '본체' },
    { no: 2, name: '둘째 샘플', role: 'aux', impl: '' },
  ],
  cardShapes: [{ shape: 'hero', note: '큰 사진' }],
  knobs: {
    condition: { open: '비 오는 날', closed: '평일 낮' },
    place: { open: '카페', closed: '병원' },
    time: { open: '저녁', closed: '새벽' },
    reward: { open: '배지', closed: '' },
    tribe: { rule: '한 트라이브만', example: '야행성' },
  },
  pitfalls: '비가 안 오면 비어 보여요',
}

function clone(draft: PatternDraft): PatternDraft {
  return JSON.parse(JSON.stringify(draft)) as PatternDraft
}

describe('draftFromRecord · inputFromDraft', () => {
  it('시드 모양 레코드를 초안으로 바꿨다가 입력으로 되돌리면 원래 값과 같다', () => {
    const draft = draftFromRecord(RECORD as never)
    expect(draft.samples[0]).toEqual({ no: '1', name: '첫째 샘플', role: 'main', impl: '본체' })
    expect(draft.knobs.tribe).toEqual(['한 트라이브만', '야행성'])
    expect(draft.knobs.place).toEqual(['카페', '병원'])

    const checked = validateOpsPatternInput(inputFromDraft(draft))
    expect(checked).toEqual({ ok: true, value: RECORD })
  })

  it('깨진 JSONB는 던지지 않고 그 칸만 빈 칸이 된다', () => {
    const draft = draftFromRecord({
      ...RECORD,
      menus: '망가짐',
      samples: [{ no: 'x', name: 3, role: 'boss', impl: null }, '글자'],
      cardShapes: [{ shape: 'banner', note: 7 }, null],
      knobs: { place: '글자', time: { open: 5, closed: '밤' } },
    } as never)
    expect(draft.menus).toEqual([])
    expect(draft.samples).toEqual([
      { no: '', name: '', role: '', impl: '' },
      { no: '', name: '', role: '', impl: '' },
    ])
    expect(draft.cardShapes).toEqual([
      { shape: '', note: '' },
      { shape: '', note: '' },
    ])
    expect(draft.knobs.place).toEqual(['', ''])
    expect(draft.knobs.time).toEqual(['', '밤'])
    expect(draft.knobs.condition).toEqual(['', ''])
  })

  it('배열이 아닌 samples·cardShapes는 빈 목록이 된다', () => {
    const draft = draftFromRecord({ ...RECORD, samples: { no: 1 }, cardShapes: 'x', knobs: null } as never)
    expect(draft.samples).toEqual([])
    expect(draft.cardShapes).toEqual([])
    expect(draft.knobs.tribe).toEqual(['', ''])
  })

  it('고르지 않은 역할·모양과 비어 있거나 숫자가 아닌 번호는 검사가 칸별 문장으로 막는다', () => {
    const draft = emptyDraft()
    draft.name = '이름'
    draft.principle = '원리'
    draft.userExperience = '경험'
    draft.samples = [
      { no: '', name: '샘플', role: '', impl: '' },
      { no: '1.5', name: '샘플', role: 'main', impl: '' },
      { no: '0', name: '샘플', role: 'main', impl: '' },
    ]
    draft.cardShapes = [{ shape: '', note: '' }]
    const checked = validateOpsPatternInput(inputFromDraft(draft))
    expect(checked.ok).toBe(false)
    if (checked.ok) return
    expect(Object.keys(checked.fieldErrors)).toEqual(
      expect.arrayContaining(['samples.0.no', 'samples.0.role', 'samples.1.no', 'samples.2.no', 'cardShapes.0.shape'])
    )
  })

  it('빈 초안은 필수 세 칸 오류를 낸다', () => {
    const checked = validateOpsPatternInput(inputFromDraft(emptyDraft()))
    expect(checked.ok).toBe(false)
    if (checked.ok) return
    expect(Object.keys(checked.fieldErrors)).toEqual(['name', 'principle', 'userExperience'])
  })
})

describe('changedFields', () => {
  const base = draftFromRecord(RECORD as never)

  it('같은 초안이면 바뀐 칸이 없다', () => {
    expect(changedFields(base, clone(base))).toEqual([])
  })

  it('칸 이름을 폼 순서대로 돌려준다 (손잡이는 「손잡이 · 장소」)', () => {
    const draft = clone(base)
    draft.pitfalls = '새 주의점'
    draft.knobs.place = ['도서관', '병원']
    draft.name = '새 이름'
    draft.menus = ['홈피드']
    expect(changedFields(base, draft)).toEqual(['이름', '쓰는 메뉴', '손잡이 · 장소', '주의점'])
  })

  it('앞뒤 공백만 바뀐 칸은 세지 않는다', () => {
    const draft = clone(base)
    draft.name = ` ${draft.name}  `
    draft.samples[0].impl = '본체 '
    draft.knobs.reward = [' 배지', '']
    draft.menus = [' 홈피드 ', '탐색']
    expect(changedFields(base, draft)).toEqual([])
  })

  it('샘플 줄 순서가 바뀌면 「샘플」이 바뀐 칸이다', () => {
    const draft = clone(base)
    draft.samples = [draft.samples[1], draft.samples[0]]
    expect(changedFields(base, draft)).toEqual(['샘플'])
  })

  it('샘플 줄을 더하거나 카드 모양을 바꾸면 각각 한 칸으로 센다', () => {
    const draft = clone(base)
    draft.samples.push({ no: '3', name: '', role: '', impl: '' })
    draft.cardShapes[0].shape = 'poster'
    expect(changedFields(base, draft)).toEqual(['카드 모양', '샘플'])
  })

  it('손잡이 두 칸이 모두 바뀌어도 그 손잡이는 한 칸으로 센다', () => {
    const draft = clone(base)
    draft.knobs.tribe = ['다른 규칙', '다른 예시']
    expect(changedFields(base, draft)).toEqual(['손잡이 · 트라이브'])
  })
})

describe('오류 경로', () => {
  it('경로를 구역과 칸 id로 잇는다', () => {
    expect(fieldErrorTarget('name')).toEqual({ section: 'basic', domId: 'pattern-field-name' })
    expect(fieldErrorTarget('samples.2.role')).toEqual({ section: 'samples', domId: 'pattern-field-samples-2-role' })
    expect(fieldErrorTarget('knobs.place.open')).toEqual({ section: 'knobs', domId: 'pattern-field-knobs-place-open' })
    expect(fieldErrorTarget('cardShapes.0.shape').section).toBe('menus')
    expect(fieldErrorTarget('menus').section).toBe('menus')
    expect(fieldErrorTarget('pitfalls').section).toBe('pitfalls')
    expect(fieldErrorTarget('status').section).toBeNull()
    expect(fieldDomId('menus.3')).toBe('pattern-field-menus-3')
  })

  it('오류 경로를 폼에 나온 순서로 세우고 같은 칸 안에서는 받은 순서를 지킨다', () => {
    const errors = { pitfalls: 'p', 'samples.1.name': 's1', 'samples.0.no': 's0', 'knobs.time.open': 'k', userExperience: 'u', name: 'n', 'menus.1': 'm' }
    expect(orderedErrorPaths(errors)).toEqual(['name', 'userExperience', 'menus.1', 'knobs.time.open', 'samples.1.name', 'samples.0.no', 'pitfalls'])
  })
})
