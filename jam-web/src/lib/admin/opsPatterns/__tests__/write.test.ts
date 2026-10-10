/**
 * 운영 패턴 사전 쓰기 (티켓 20261008_1545, 상위 20260930_1503 ⑩a-1) — `write.ts`
 *
 * 서비스 클라이언트는 메모리 DB(`fakePatternDb.ts`)로 바꾼다. 확인하는 것:
 * - 검사: 필수 3칸, 길이 상한, 메뉴·샘플 개수, 샘플 번호 중복·역할, 카드 모양, 손잡이 칸은 선택, 알 수 없는 키 버림, 앞뒤 공백 뗌
 * - 지금 시드 P01~P18(원고 파서 출력)이 모두 검사를 통과한다
 * - 번호: P18 → P19, P99 → P100, 빈 사전 → P01
 * - 만들기: 출처·상태·번호, 번호 충돌과 제안 항목 충돌은 각각 409, 응답에 관리자 ID 없음
 * - 고치기: 조건부 update, 404/409 구분, 값이 같으면 changed:false(DB 그대로)
 * - 상태 바꾸기: 쉬는 중 이유 필수·200자, 쉬는 중이 아니게 되면 이유를 지움, 같은 상태, 모든 전환
 * - `OpsPatternProposal`이 `OpsPatternInput`에 대입 가능(⑪이 변환 없이 넘긴다)
 */
import { describe, it, expect, beforeEach, afterEach, vi, expectTypeOf } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import type { OpsPatternProposal } from '@/lib/admin/opsInbox/fields'
import { OPS_PATTERN_STATUSES } from '../constants'
import {
  PATTERN_CREATE_CONFLICT_MESSAGE,
  PATTERN_FIELDS_INVALID_MESSAGE,
  PATTERN_ORIGIN_CONFLICT_MESSAGE,
  PATTERN_SAVE_FAILED_MESSAGE,
  PATTERN_STATUS_CONFLICT_MESSAGE,
  PATTERN_UPDATE_CONFLICT_MESSAGE,
  changeOpsPatternStatus,
  createOpsPattern,
  nextPatternNo,
  updateOpsPattern,
  validateOpsPatternInput,
  type OpsPatternInput,
} from '../write'
import { fakeDb, fakeService, patternRow } from './fakePatternDb'

type ServiceClient = ReturnType<typeof createServiceClient>
const service = fakeService as unknown as ServiceClient

const ACTOR = 'admin-7'

function validInput(extra: Record<string, unknown> = {}) {
  return {
    name: '  새 패턴  ',
    principle: '작동 원리',
    userExperience: '유저가 겪는 것',
    menus: ['홈피드', ' 미션 '],
    samples: [
      { no: 3, name: '샘플 셋', role: 'main', impl: '지금 가능' },
      { no: 5, name: '샘플 다섯', role: 'related' },
    ],
    cardShapes: [{ shape: 'hero', note: '큰 카드' }, { shape: 'list' }],
    knobs: { condition: { open: '열린', closed: '닫은' }, tribe: { rule: '규칙', example: '예시' } },
    pitfalls: '주의',
    ...extra,
  }
}

function fieldErrorsOf(raw: unknown) {
  const checked = validateOpsPatternInput(raw)
  if (checked.ok) throw new Error('검사를 통과하면 안 된다')
  return checked.fieldErrors
}

beforeEach(() => {
  fakeDb.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('validateOpsPatternInput', () => {
  it('앞뒤 공백을 떼고, 빠진 칸은 비워 정규 모양으로 만든다. 손잡이는 항상 5종 × 두 칸이다', () => {
    const checked = validateOpsPatternInput(validInput())
    if (!checked.ok) throw new Error(JSON.stringify(checked.fieldErrors))
    expect(checked.value.name).toBe('새 패턴')
    expect(checked.value.menus).toEqual(['홈피드', '미션'])
    expect(checked.value.samples[1]).toEqual({ no: 5, name: '샘플 다섯', role: 'related', impl: '' })
    expect(checked.value.cardShapes).toEqual([{ shape: 'hero', note: '큰 카드' }, { shape: 'list', note: '' }])
    expect(checked.value.knobs).toEqual({
      condition: { open: '열린', closed: '닫은' },
      place: { open: '', closed: '' },
      time: { open: '', closed: '' },
      reward: { open: '', closed: '' },
      tribe: { rule: '규칙', example: '예시' },
    })
  })

  it('필수 3칸만 있어도 통과한다(메뉴·샘플·카드 모양·손잡이·주의점은 선택)', () => {
    const checked = validateOpsPatternInput({ name: '이름', principle: '원리', userExperience: '경험' })
    if (!checked.ok) throw new Error(JSON.stringify(checked.fieldErrors))
    expect(checked.value).toMatchObject({ menus: [], samples: [], cardShapes: [], pitfalls: '' })
  })

  it('필수 3칸은 공백만 있거나 비어 있으면 칸별 오류다', () => {
    expect(fieldErrorsOf({ name: '   ', principle: '', userExperience: 3 })).toEqual({
      name: '이름을 적어 주세요.',
      principle: '작동 원리를 적어 주세요.',
      userExperience: '유저가 겪는 것을 적어 주세요.',
    })
    expect(Object.keys(fieldErrorsOf('문자열'))).toEqual(['name', 'principle', 'userExperience'])
    expect(Object.keys(fieldErrorsOf(null))).toEqual(['name', 'principle', 'userExperience'])
  })

  it('길이 상한: 이름 60자, 긴 글 칸 2,000자, 손잡이 칸 2,000자(공백을 뗀 뒤 센다)', () => {
    expect(validateOpsPatternInput(validInput({ name: '가'.repeat(60) })).ok).toBe(true)
    expect(validateOpsPatternInput(validInput({ name: ` ${'가'.repeat(60)} ` })).ok).toBe(true)
    expect(fieldErrorsOf(validInput({ name: '가'.repeat(61) })).name).toContain('60자')
    expect(validateOpsPatternInput(validInput({ principle: '가'.repeat(2000) })).ok).toBe(true)
    const errors = fieldErrorsOf(
      validInput({
        principle: '가'.repeat(2001),
        userExperience: '가'.repeat(2001),
        pitfalls: '가'.repeat(2001),
        knobs: { place: { closed: '가'.repeat(2001) } },
      })
    )
    expect(Object.keys(errors).sort()).toEqual(['knobs.place.closed', 'pitfalls', 'principle', 'userExperience'])
    expect(errors.principle).toContain('2,000자')
  })

  it('메뉴: 10개까지, 각 30자, 비어 있지 않은 문자열', () => {
    expect(validateOpsPatternInput(validInput({ menus: Array.from({ length: 10 }, (_, i) => `메뉴${i}`) })).ok).toBe(true)
    expect(fieldErrorsOf(validInput({ menus: Array.from({ length: 11 }, (_, i) => `메뉴${i}`) })).menus).toContain('10개')
    expect(validateOpsPatternInput(validInput({ menus: ['가'.repeat(30)] })).ok).toBe(true)
    expect(fieldErrorsOf(validInput({ menus: ['메뉴', '가'.repeat(31), '  ', 7] }))).toEqual({
      'menus.1': '메뉴 이름은 30자까지 적을 수 있어요.',
      'menus.2': '메뉴 이름을 적어 주세요.',
      'menus.3': '메뉴 이름을 적어 주세요.',
    })
    expect(fieldErrorsOf(validInput({ menus: '메뉴' })).menus).toBeDefined()
  })

  it('샘플: 20개까지, 번호는 양의 정수이고 중복 없음, 이름 필수, 역할 3값, 구현은 선택', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ no: i + 1, name: `샘플${i}`, role: 'main' }))
    expect(fieldErrorsOf(validInput({ samples: many })).samples).toContain('20개')
    expect(validateOpsPatternInput(validInput({ samples: many.slice(0, 20) })).ok).toBe(true)

    const errors = fieldErrorsOf(
      validInput({
        samples: [
          { no: 1, name: '하나', role: 'main' },
          { no: 1, name: '중복', role: 'aux' },
          { no: 0, name: '영', role: 'main' },
          { no: 2.5, name: '소수', role: 'main' },
          { no: '3', name: '문자', role: 'main' },
          { no: 4, name: ' ', role: 'main' },
          { no: 5, name: '역할', role: 'boss' },
          { no: 6, name: '구현', role: 'main', impl: 3 },
          '샘플',
        ],
      })
    )
    expect(errors).toMatchObject({
      'samples.1.no': expect.stringContaining('이미 넣은'),
      'samples.2.no': expect.any(String),
      'samples.3.no': expect.any(String),
      'samples.4.no': expect.any(String),
      'samples.5.name': '샘플 이름을 적어 주세요.',
      'samples.6.role': expect.stringContaining('역할'),
      'samples.7.impl': expect.any(String),
      'samples.8': expect.any(String),
    })
    expect(errors['samples.0.no']).toBeUndefined()
    for (const role of ['main', 'aux', 'related']) {
      expect(validateOpsPatternInput(validInput({ samples: [{ no: 1, name: '샘플', role }] })).ok).toBe(true)
    }
  })

  it('카드 모양: CARD_SHAPES 5개만, 메모는 선택이고 200자까지', () => {
    for (const shape of ['hero', 'poster', 'square', 'brief', 'list']) {
      expect(validateOpsPatternInput(validInput({ cardShapes: [{ shape }] })).ok).toBe(true)
    }
    const errors = fieldErrorsOf(
      validInput({ cardShapes: [{ shape: 'large_thumbnail' }, { shape: 'hero', note: '가'.repeat(201) }, { shape: 'Hero' }, '카드'] })
    )
    expect(Object.keys(errors).sort()).toEqual(['cardShapes.0.shape', 'cardShapes.1.note', 'cardShapes.2.shape', 'cardShapes.3'])
    expect(validateOpsPatternInput(validInput({ cardShapes: [{ shape: 'hero', note: '가'.repeat(200) }] })).ok).toBe(true)
  })

  it('손잡이 칸은 빈 문자열을 받고, 문자열이 아니면 칸별 오류다', () => {
    expect(validateOpsPatternInput(validInput({ knobs: {} })).ok).toBe(true)
    expect(validateOpsPatternInput(validInput({ knobs: { time: { open: '', closed: '' } } })).ok).toBe(true)
    expect(fieldErrorsOf(validInput({ knobs: { reward: { open: 5 }, tribe: '규칙' } }))).toEqual({
      'knobs.reward.open': '보상 열린 값은 글로 적어 주세요.',
      'knobs.tribe': '트라이브 손잡이는 칸별 내용으로 보내 주세요.',
    })
    expect(fieldErrorsOf(validInput({ knobs: ['조건'] })).knobs).toBeDefined()
  })

  it('알 수 없는 키는 버린다(번호·상태·출처·관리자 ID를 본문으로 못 넣는다)', () => {
    const checked = validateOpsPatternInput(
      validInput({
        patternNo: 'P99',
        status: 'archived',
        origin: 'seed',
        updatedBy: 'x',
        samples: [{ no: 1, name: '샘플', role: 'main', extra: 1 }],
        knobs: { place: { open: '열린', extra: 'x' }, weather: { open: 'x' } },
      })
    )
    if (!checked.ok) throw new Error(JSON.stringify(checked.fieldErrors))
    expect(Object.keys(checked.value).sort()).toEqual(
      ['cardShapes', 'knobs', 'menus', 'name', 'pitfalls', 'principle', 'samples', 'userExperience']
    )
    expect(Object.keys(checked.value.samples[0]).sort()).toEqual(['impl', 'name', 'no', 'role'])
    expect(Object.keys(checked.value.knobs).sort()).toEqual(['condition', 'place', 'reward', 'time', 'tribe'])
    expect(checked.value.knobs.place).toEqual({ open: '열린', closed: '' })
  })
})

describe('시드 P01~P18', () => {
  it('원고 파서가 만든 18개 패턴이 모두 검사를 통과한다', async () => {
    const { readFileSync } = await import('node:fs')
    const root = new URL('../../../../../../', import.meta.url)
    const parser = (await import(/* @vite-ignore */ new URL('scripts/ops-patterns-seed.mjs', root).href)) as {
      parseOpsPatterns: (markdown: string) => {
        patterns: Array<Record<string, unknown> & { pattern_no: string }>
        problems: string[]
      }
    }
    const markdown = readFileSync(new URL('docs/service/content/OPS_PATTERNS.md', root), 'utf8')
    const parsed = parser.parseOpsPatterns(markdown)
    expect(parsed.problems).toEqual([])
    expect(parsed.patterns).toHaveLength(18)
    for (const pattern of parsed.patterns) {
      const checked = validateOpsPatternInput({
        name: pattern.name,
        principle: pattern.principle,
        userExperience: pattern.user_experience,
        menus: pattern.menus,
        samples: pattern.samples,
        cardShapes: pattern.card_shapes,
        knobs: pattern.knobs,
        pitfalls: pattern.pitfalls,
      })
      expect(checked.ok ? null : { no: pattern.pattern_no, errors: checked.fieldErrors }).toBeNull()
    }
  })
})

describe('nextPatternNo', () => {
  it('가장 큰 번호 + 1이다(두 자리 이상)', () => {
    expect(nextPatternNo(['P01', 'P18', 'P09'])).toBe('P19')
    expect(nextPatternNo(['P99'])).toBe('P100')
    expect(nextPatternNo(['P100', 'P99'])).toBe('P101')
    expect(nextPatternNo(['P08'])).toBe('P09')
    expect(nextPatternNo([])).toBe('P01')
  })

  it('형식이 맞지 않는 값은 건너뛴다. 중간이 비어 있어도 가장 큰 번호 뒤로 간다', () => {
    expect(nextPatternNo(['T01', 'P1', 'x', 'P03'])).toBe('P04')
    expect(nextPatternNo(['P02', 'P30'])).toBe('P31')
  })
})

describe('createOpsPattern', () => {
  beforeEach(() => {
    fakeDb.tables.ops_patterns = [patternRow('P17'), patternRow('P18', { status: 'archived' })]
  })

  it('P19로 만들고 상태 active·출처 manual·만든 사람을 남긴다. 응답에는 관리자 ID가 없다', async () => {
    const outcome = await createOpsPattern(service, validInput(), { actor: ACTOR })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.changed).toBeUndefined()
    expect(outcome.pattern).toMatchObject({
      patternNo: 'P19',
      name: '새 패턴',
      status: 'active',
      statusLabel: '사용 중',
      pauseReason: null,
      origin: 'manual',
      originItemId: null,
    })
    const stored = fakeDb.tables.ops_patterns.at(-1)
    expect(stored).toMatchObject({ pattern_no: 'P19', updated_by: ACTOR, origin: 'manual', status: 'active' })
    expect(JSON.stringify(outcome)).not.toContain(ACTOR)
    expect(JSON.stringify(outcome)).not.toContain('updated_by')
  })

  it('본문에 번호·상태·출처가 있어도 서버가 정한다', async () => {
    const outcome = await createOpsPattern(service, validInput({ patternNo: 'P01', status: 'archived', origin: 'seed' }), { actor: ACTOR })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.pattern).toMatchObject({ patternNo: 'P19', status: 'active', origin: 'manual' })
  })

  it('⑪: origin proposal과 originItemId를 받아 담는다. manual이면 originItemId는 버린다', async () => {
    const proposal = await createOpsPattern(service, validInput(), { actor: ACTOR, origin: 'proposal', originItemId: 'item-1' })
    if (!proposal.ok) throw new Error(proposal.error)
    expect(proposal.pattern).toMatchObject({ patternNo: 'P19', origin: 'proposal', originItemId: 'item-1' })
    const manual = await createOpsPattern(service, validInput(), { actor: ACTOR, origin: 'manual', originItemId: 'item-2' })
    if (!manual.ok) throw new Error(manual.error)
    expect(manual.pattern).toMatchObject({ patternNo: 'P20', origin: 'manual', originItemId: null })
  })

  it('만든 패턴은 같은 사전에서 다음 번호를 이어 받는다', async () => {
    await createOpsPattern(service, validInput(), { actor: ACTOR })
    const second = await createOpsPattern(service, validInput(), { actor: ACTOR })
    if (!second.ok) throw new Error(second.error)
    expect(second.pattern.patternNo).toBe('P20')
  })

  it('빈 사전에서는 P01이다', async () => {
    fakeDb.tables.ops_patterns = []
    const outcome = await createOpsPattern(service, validInput(), { actor: ACTOR })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.pattern.patternNo).toBe('P01')
  })

  it('검사에 걸리면 400과 칸별 오류이고 DB를 건드리지 않는다', async () => {
    const outcome = await createOpsPattern(service, validInput({ name: '' }), { actor: ACTOR })
    expect(outcome).toEqual({ ok: false, status: 400, error: PATTERN_FIELDS_INVALID_MESSAGE, fieldErrors: { name: '이름을 적어 주세요.' } })
    expect(fakeDb.writeCalls).toBe(0)
    expect(fakeDb.tables.ops_patterns).toHaveLength(2)
  })

  it('번호가 그사이 겹치면(23505, pattern_no) 재시도하지 않고 409다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.beforeWrite = null
      fakeDb.tables.ops_patterns.push(patternRow('P19'))
    }
    const outcome = await createOpsPattern(service, validInput(), { actor: ACTOR })
    expect(outcome).toEqual({ ok: false, status: 409, error: PATTERN_CREATE_CONFLICT_MESSAGE })
    expect(fakeDb.writeCalls).toBe(1)
  })

  it('같은 제안 항목으로 두 번 만들면(origin_item_id 유일) 409다', async () => {
    await createOpsPattern(service, validInput(), { actor: ACTOR, origin: 'proposal', originItemId: 'item-1' })
    const again = await createOpsPattern(service, validInput(), { actor: ACTOR, origin: 'proposal', originItemId: 'item-1' })
    expect(again).toEqual({ ok: false, status: 409, error: PATTERN_ORIGIN_CONFLICT_MESSAGE })
    expect(fakeDb.tables.ops_patterns).toHaveLength(3)
  })

  it('조회·저장 오류는 고정 문장 500이고 원문을 싣지 않는다', async () => {
    fakeDb.readError = 'relation secret'
    const read = await createOpsPattern(service, validInput(), { actor: ACTOR })
    expect(read).toEqual({ ok: false, status: 500, error: PATTERN_SAVE_FAILED_MESSAGE })
    fakeDb.readError = null
    fakeDb.writeError = { message: 'disk secret' }
    const write = await createOpsPattern(service, validInput(), { actor: ACTOR })
    expect(write).toEqual({ ok: false, status: 500, error: PATTERN_SAVE_FAILED_MESSAGE })
    expect(JSON.stringify([read, write])).not.toContain('secret')
  })
})

describe('updateOpsPattern', () => {
  const T1 = '2026-10-01T01:00:00+00:00'

  beforeEach(() => {
    fakeDb.tables.ops_patterns = [patternRow('P10', { status: 'paused', pause_reason: '기능 대기', origin: 'manual' })]
  })

  it('내용 칸만 덮어쓰고 수정 시각·고친 사람을 갱신한다. 번호·출처·상태·쉬는 이유는 그대로다', async () => {
    const outcome = await updateOpsPattern(service, 'P10', validInput({ name: '고친 이름' }), { actor: ACTOR, expectedUpdatedAt: T1 })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.changed).toBe(true)
    expect(outcome.pattern).toMatchObject({
      patternNo: 'P10',
      name: '고친 이름',
      status: 'paused',
      pauseReason: '기능 대기',
      origin: 'manual',
      createdAt: '2026-10-01T00:00:00+00:00',
    })
    expect(outcome.pattern.updatedAt).not.toBe(T1)
    expect(fakeDb.tables.ops_patterns[0]).toMatchObject({ updated_by: ACTOR, name: '고친 이름', status: 'paused' })
    expect(JSON.stringify(outcome)).not.toContain(ACTOR)
  })

  it('본문의 번호·상태·출처는 무시한다', async () => {
    await updateOpsPattern(service, 'P10', validInput({ patternNo: 'P99', status: 'archived', origin: 'seed' }), { actor: ACTOR, expectedUpdatedAt: T1 })
    expect(fakeDb.tables.ops_patterns[0]).toMatchObject({ pattern_no: 'P10', status: 'paused', origin: 'manual' })
  })

  it('화면이 본 시각과 다르면 409이고 DB는 그대로다', async () => {
    const before = JSON.stringify(fakeDb.tables.ops_patterns)
    const outcome = await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: '2026-09-30T00:00:00+00:00' })
    expect(outcome).toEqual({ ok: false, status: 409, error: PATTERN_UPDATE_CONFLICT_MESSAGE })
    expect(fakeDb.writeCalls).toBe(0)
    expect(JSON.stringify(fakeDb.tables.ops_patterns)).toBe(before)
  })

  it('읽은 뒤 쓰기 전에 다른 곳이 먼저 고쳤으면(조건부 update 0행) 409이고 덮어쓰지 않는다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.beforeWrite = null
      Object.assign(fakeDb.tables.ops_patterns[0], { name: '먼저 고친 이름', updated_at: '2026-10-02T00:00:00+00:00' })
    }
    const outcome = await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: T1 })
    expect(outcome).toEqual({ ok: false, status: 409, error: PATTERN_UPDATE_CONFLICT_MESSAGE })
    expect(fakeDb.tables.ops_patterns[0].name).toBe('먼저 고친 이름')
  })

  it('쓰기 사이에 행이 사라졌으면 404다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.beforeWrite = null
      fakeDb.tables.ops_patterns = []
    }
    const outcome = await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: T1 })
    expect(outcome).toMatchObject({ ok: false, status: 404 })
  })

  it('없는 번호·형식이 틀린 번호는 404다', async () => {
    expect(await updateOpsPattern(service, 'P99', validInput(), { actor: ACTOR, expectedUpdatedAt: T1 })).toMatchObject({ ok: false, status: 404 })
    expect(await updateOpsPattern(service, 'p10', validInput(), { actor: ACTOR, expectedUpdatedAt: T1 })).toMatchObject({ ok: false, status: 404 })
  })

  it('수정 시각이 없거나 시각이 아니면 400이다', async () => {
    for (const bad of [undefined, null, '', '어제', 123]) {
      expect(await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: bad })).toMatchObject({ ok: false, status: 400 })
    }
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('검사에 걸리면 400과 칸별 오류다', async () => {
    const outcome = await updateOpsPattern(service, 'P10', validInput({ principle: '' }), { actor: ACTOR, expectedUpdatedAt: T1 })
    expect(outcome).toMatchObject({ ok: false, status: 400, fieldErrors: { principle: '작동 원리를 적어 주세요.' } })
  })

  it('내용이 같으면 쓰지 않고 changed:false로 현재 값을 돌려준다(수정 시각도 그대로)', async () => {
    const first = await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: T1 })
    if (!first.ok) throw new Error(first.error)
    const writes = fakeDb.writeCalls
    const second = await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: first.pattern.updatedAt })
    if (!second.ok) throw new Error(second.error)
    expect(second.changed).toBe(false)
    expect(second.pattern.updatedAt).toBe(first.pattern.updatedAt)
    expect(fakeDb.writeCalls).toBe(writes)
  })

  it('조회 오류는 고정 문장 500이다', async () => {
    fakeDb.readError = 'relation secret'
    const outcome = await updateOpsPattern(service, 'P10', validInput(), { actor: ACTOR, expectedUpdatedAt: T1 })
    expect(outcome).toEqual({ ok: false, status: 500, error: PATTERN_SAVE_FAILED_MESSAGE })
  })
})

describe('changeOpsPatternStatus', () => {
  const T1 = '2026-10-01T01:00:00+00:00'
  const ctx = { actor: ACTOR, expectedUpdatedAt: T1 }

  beforeEach(() => {
    fakeDb.tables.ops_patterns = [patternRow('P10')]
  })

  it('쉬는 중으로 바꾸면 이유를 공백 뗀 채 저장하고 수정 시각·고친 사람을 갱신한다', async () => {
    const outcome = await changeOpsPatternStatus(service, 'P10', { status: 'paused', pauseReason: '  기능 대기  ' }, ctx)
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.changed).toBe(true)
    expect(outcome.pattern).toMatchObject({ status: 'paused', statusLabel: '쉬는 중', pauseReason: '기능 대기', name: '패턴 P10' })
    expect(outcome.pattern.updatedAt).not.toBe(T1)
    expect(fakeDb.tables.ops_patterns[0]).toMatchObject({ updated_by: ACTOR, status: 'paused' })
  })

  it('쉬는 중은 이유가 필수다: 없거나 공백뿐이거나 200자를 넘으면 400이고 DB는 그대로다', async () => {
    for (const pauseReason of [undefined, null, '', '   ', 5, '가'.repeat(201)]) {
      const outcome = await changeOpsPatternStatus(service, 'P10', { status: 'paused', pauseReason }, ctx)
      expect(outcome).toMatchObject({ ok: false, status: 400, fieldErrors: { pauseReason: expect.stringContaining('200자') } })
    }
    expect(fakeDb.writeCalls).toBe(0)
    const ok = await changeOpsPatternStatus(service, 'P10', { status: 'paused', pauseReason: '가'.repeat(200) }, ctx)
    expect(ok.ok).toBe(true)
  })

  it('쉬는 중이 아닌 상태로 바꾸면 쉬는 이유를 지운다(넘긴 이유도 무시한다)', async () => {
    fakeDb.tables.ops_patterns = [patternRow('P10', { status: 'paused', pause_reason: '기능 대기' })]
    const outcome = await changeOpsPatternStatus(service, 'P10', { status: 'active', pauseReason: '남기고 싶은 이유' }, ctx)
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.pattern).toMatchObject({ status: 'active', pauseReason: null })
    expect(fakeDb.tables.ops_patterns[0].pause_reason).toBeNull()
  })

  it('모든 전환을 받는다(보관에서 사용 중, 보관에서 쉬는 중 포함)', async () => {
    for (const from of OPS_PATTERN_STATUSES) {
      for (const to of OPS_PATTERN_STATUSES) {
        if (from === to) continue
        fakeDb.tables.ops_patterns = [patternRow('P10', { status: from, pause_reason: from === 'paused' ? '이유' : null })]
        const outcome = await changeOpsPatternStatus(service, 'P10', { status: to, pauseReason: '새 이유' }, ctx)
        if (!outcome.ok) throw new Error(`${from} → ${to}: ${outcome.error}`)
        expect(outcome.pattern.status).toBe(to)
        expect(outcome.pattern.pauseReason).toBe(to === 'paused' ? '새 이유' : null)
      }
    }
  })

  it('같은 상태로 바꾸는 요청: 쉬는 중의 이유가 달라질 때만 쓰고, 그 밖에는 changed:false다', async () => {
    const same = await changeOpsPatternStatus(service, 'P10', { status: 'active' }, ctx)
    expect(same).toMatchObject({ ok: true, changed: false })
    expect(fakeDb.writeCalls).toBe(0)

    fakeDb.tables.ops_patterns = [patternRow('P10', { status: 'paused', pause_reason: '기능 대기' })]
    const sameReason = await changeOpsPatternStatus(service, 'P10', { status: 'paused', pauseReason: '기능 대기' }, ctx)
    expect(sameReason).toMatchObject({ ok: true, changed: false })
    expect(fakeDb.writeCalls).toBe(0)

    const newReason = await changeOpsPatternStatus(service, 'P10', { status: 'paused', pauseReason: '이유 바뀜' }, ctx)
    if (!newReason.ok) throw new Error(newReason.error)
    expect(newReason).toMatchObject({ changed: true })
    expect(newReason.pattern).toMatchObject({ status: 'paused', pauseReason: '이유 바뀜' })
  })

  it('상태 값이 아니면 400이다', async () => {
    for (const status of [undefined, '', 'deleted', 3]) {
      expect(await changeOpsPatternStatus(service, 'P10', { status }, ctx)).toMatchObject({ ok: false, status: 400, fieldErrors: { status: expect.any(String) } })
    }
  })

  it('화면이 본 시각과 다르면 409이고 DB는 그대로다', async () => {
    const outcome = await changeOpsPatternStatus(service, 'P10', { status: 'archived' }, { actor: ACTOR, expectedUpdatedAt: '2026-09-30T00:00:00+00:00' })
    expect(outcome).toEqual({ ok: false, status: 409, error: PATTERN_STATUS_CONFLICT_MESSAGE })
    expect(fakeDb.tables.ops_patterns[0].status).toBe('active')
    expect(fakeDb.writeCalls).toBe(0)
  })

  it('읽은 뒤 쓰기 전에 다른 곳이 바꿨으면 409, 행이 없으면 404다', async () => {
    fakeDb.beforeWrite = () => {
      fakeDb.beforeWrite = null
      Object.assign(fakeDb.tables.ops_patterns[0], { status: 'archived', updated_at: '2026-10-02T00:00:00+00:00' })
    }
    expect(await changeOpsPatternStatus(service, 'P10', { status: 'paused', pauseReason: '이유' }, ctx)).toEqual({
      ok: false,
      status: 409,
      error: PATTERN_STATUS_CONFLICT_MESSAGE,
    })
    expect(fakeDb.tables.ops_patterns[0].status).toBe('archived')

    expect(await changeOpsPatternStatus(service, 'P99', { status: 'archived' }, ctx)).toMatchObject({ ok: false, status: 404 })
  })

  it('수정 시각이 없으면 400이다', async () => {
    expect(await changeOpsPatternStatus(service, 'P10', { status: 'archived' }, { actor: ACTOR, expectedUpdatedAt: undefined })).toMatchObject({ ok: false, status: 400 })
  })
})

describe('타입 호환', () => {
  it('OpsPatternProposal(패턴 제안 항목의 내용)이 OpsPatternInput에 그대로 대입된다', () => {
    expectTypeOf<OpsPatternProposal>().toExtend<OpsPatternInput>()
    expectTypeOf<OpsPatternInput>().toExtend<OpsPatternProposal>()
  })
})
