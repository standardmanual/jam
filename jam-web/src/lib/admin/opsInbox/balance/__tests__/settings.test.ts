/**
 * 설정 화면(S7) 카드의 순수 논리와 문구 (티켓 20260930_1459 조각 B, 채원 확정 설계)
 *
 * 화면 부품은 이 함수들의 결과만 그린다. 지키는 것:
 * - 값 칸 정의(R1~R4 한 칸, R5 종류 5줄, R6·R7·R8은 칸 없음)와 초안(저장된 값에서 만든 글)
 * - 값을 고치는 동안 바뀌는 결과 문장(채원 확정 문구와 글자 그대로), 칸이 틀리면 문장이 없고 오류 문장이 나온다
 * - 저장 전 표시(바뀐 칸·켜기·수준), 바뀐 것만 담은 저장 본문, 임시값 힌트
 * - R1 「지금 서비스」 상자 3갈래와 못 읽을 때
 * - R6·R7 파생 표시(R5를 따른다), R8 키 목록
 * - 마지막 변경·직전 값 줄(한 번도 안 바꿨으면 「처음 값 그대로예요」), 직전 값으로 되돌릴 수 있는지
 */
import { describe, it, expect } from 'vitest'
import type { OpsRuleRecord } from '../rules'
import {
  BALANCE_RULE_GROUPS,
  canRevertToPrevious,
  derivedPointsText,
  draftChanges,
  draftFieldErrors,
  draftFromRecord,
  draftToPatch,
  economyKeysOf,
  lastChangeLines,
  openCollectionsNote,
  previousValueText,
  readPointRewardValue,
  recordHasProvisional,
  resultSentence,
  ruleAnchorId,
  ruleFieldSpecs,
  savedToastTitle,
  shouldHintProvisional,
  textToNumberInput,
  validFieldNumber,
  type RuleDraft,
} from '../settings'
import { BALANCE_RULE_KEYS } from '../rules'

const T0 = '2026-10-01T06:20:00+00:00' // 10/1(목) 15:20 KST

function record(ruleKey: string, value: unknown, overrides: Partial<OpsRuleRecord> = {}): OpsRuleRecord {
  return {
    ruleKey,
    group: 'balance',
    value: value as OpsRuleRecord['value'],
    level: 'warn',
    enabled: true,
    updatedAt: T0,
    edited: false,
    previousValue: null,
    ...overrides,
  }
}

const R1 = record('open_collections_max', { max: 6, provisional: true })
const R2 = record('weekly_new_collections_max', { max: 1, provisional: true })
const R3 = record('rolling_new_collections_max', { max: 2, provisional: true })
const R4 = record('launch_lead_days_min', { min_days: 28, provisional: false })
const R5_VALUE = {
  kinds: {
    count_badge: { max: 10, provisional: true },
    achievement_badge: { max: 100, provisional: false },
    mission: { max: 50, provisional: true },
    collection_completion: { max: 20, provisional: false },
    recipe: { max: 30, provisional: false },
  },
}
const R5 = record('point_reward_max', R5_VALUE)

function withText(draft: RuleDraft, path: string, text: string): RuleDraft {
  return { ...draft, texts: { ...draft.texts, [path]: text } }
}

describe('그룹과 앵커', () => {
  it('8개 규칙이 3그룹에 한 번씩 나온다(컬렉션 개방 · 포인트 크기 · 경제 수치 불변)', () => {
    expect(BALANCE_RULE_GROUPS.map((g) => g.title)).toEqual(['컬렉션 개방', '포인트 크기', '경제 수치 불변'])
    expect(BALANCE_RULE_GROUPS.flatMap((g) => g.keys)).toEqual([...BALANCE_RULE_KEYS])
  })

  it('앵커는 #rule-<규칙 키>이다(S3 「밸런스 규칙 보기」가 이 앵커로 온다)', () => {
    expect(ruleAnchorId('open_collections_max')).toBe('rule-open_collections_max')
  })
})

describe('칸 정의', () => {
  it('R1~R4는 한 칸이고 최솟값은 1이다', () => {
    expect(ruleFieldSpecs('open_collections_max')).toEqual([
      { path: 'max', provisionalPath: 'provisional', label: '열어 둘 수 있는 컬렉션 최대 수', unit: '개', min: 1 },
    ])
    expect(ruleFieldSpecs('weekly_new_collections_max')[0]).toMatchObject({ label: '한 주에 새로 열 수 있는 컬렉션 최대 수', unit: '개' })
    expect(ruleFieldSpecs('rolling_new_collections_max')[0]).toMatchObject({ label: '28일 동안 새로 열 수 있는 컬렉션 최대 수', unit: '개' })
    expect(ruleFieldSpecs('launch_lead_days_min')[0]).toEqual({
      path: 'min_days',
      provisionalPath: 'provisional',
      label: '공개까지 남아 있어야 하는 최소 일수',
      unit: '일',
      min: 1,
    })
  })

  it('R5는 종류 5줄(횟수형·달성형·미션·컬렉션 완성·레시피)이고 최솟값은 0이다', () => {
    const specs = ruleFieldSpecs('point_reward_max')
    expect(specs.map((s) => s.label)).toEqual(['횟수형 JAM! 배지', '달성형 JAM! 배지', '미션', '컬렉션 완성', '레시피'])
    expect(specs.map((s) => s.path)).toEqual([
      'kinds.count_badge.max',
      'kinds.achievement_badge.max',
      'kinds.mission.max',
      'kinds.collection_completion.max',
      'kinds.recipe.max',
    ])
    expect(specs.every((s) => s.min === 0 && s.unit === '포인트')).toBe(true)
  })

  it('R6·R7·R8은 값 칸이 없다', () => {
    for (const key of ['single_action_points', 'count_ladder_points', 'economy_keys'] as const) expect(ruleFieldSpecs(key)).toEqual([])
  })
})

describe('초안', () => {
  it('저장된 값에서 칸의 글과 임시값 표시를 만든다', () => {
    expect(draftFromRecord(R1)).toEqual({ enabled: true, level: 'warn', texts: { max: '6' }, provisional: { provisional: true } })
    expect(draftFromRecord(R4)).toEqual({ enabled: true, level: 'warn', texts: { min_days: '28' }, provisional: { provisional: false } })
    const r5 = draftFromRecord(R5)
    expect(r5.texts).toEqual({
      'kinds.count_badge.max': '10',
      'kinds.achievement_badge.max': '100',
      'kinds.mission.max': '50',
      'kinds.collection_completion.max': '20',
      'kinds.recipe.max': '30',
    })
    expect(r5.provisional['kinds.count_badge.provisional']).toBe(true)
    expect(r5.provisional['kinds.recipe.provisional']).toBe(false)
  })

  it('수준·켜기는 저장된 대로이고, 값 모양이 틀린 칸은 빈 글이다', () => {
    const broken = record('open_collections_max', { max: 'x' }, { level: 'info', enabled: false })
    expect(draftFromRecord(broken)).toEqual({ enabled: false, level: 'info', texts: { max: '' }, provisional: { provisional: false } })
  })

  it('R6·R7·R8의 초안에는 칸이 없다', () => {
    expect(draftFromRecord(record('single_action_points', {}))).toEqual({ enabled: true, level: 'warn', texts: {}, provisional: {} })
  })
})

describe('글 → 숫자와 칸 확인', () => {
  it('빈 글은 빈 칸 오류, 정수 모양은 숫자, 소수·글자는 글 그대로(정수 아님 오류)다', () => {
    expect(textToNumberInput('')).toBe('')
    expect(textToNumberInput('  ')).toBe('')
    expect(textToNumberInput(' 6 ')).toBe(6)
    expect(textToNumberInput('-2')).toBe(-2)
    expect(textToNumberInput('1.5')).toBe('1.5')
    expect(textToNumberInput('abc')).toBe('abc')
  })

  it('빈 칸·소수·음수·글자가 서버와 같은 문장으로 막힌다', () => {
    const draft = draftFromRecord(R1)
    expect(draftFieldErrors('open_collections_max', withText(draft, 'max', ''))).toEqual({ max: '값을 적어 주세요' })
    expect(draftFieldErrors('open_collections_max', withText(draft, 'max', '2.5'))).toEqual({ max: '정수로 적어 주세요 (예: 6)' })
    expect(draftFieldErrors('open_collections_max', withText(draft, 'max', 'abc'))).toEqual({ max: '정수로 적어 주세요 (예: 6)' })
    expect(draftFieldErrors('open_collections_max', withText(draft, 'max', '-1'))).toEqual({ max: '1 이상의 정수로 적어 주세요' })
    expect(draftFieldErrors('open_collections_max', withText(draft, 'max', '0'))).toEqual({ max: '1 이상의 정수로 적어 주세요' })
    expect(draftFieldErrors('open_collections_max', withText(draft, 'max', '7'))).toEqual({})
  })

  it('R5는 종류별로 막히고 0은 통과한다', () => {
    const draft = draftFromRecord(R5)
    expect(draftFieldErrors('point_reward_max', withText(draft, 'kinds.mission.max', '-5'))).toEqual({
      'kinds.mission.max': '0 이상의 정수로 적어 주세요 (0이면 포인트가 있는 항목은 모두 알려요)',
    })
    expect(draftFieldErrors('point_reward_max', withText(draft, 'kinds.mission.max', '0'))).toEqual({})
  })

  it('값 칸이 없는 규칙은 오류가 없다', () => {
    expect(draftFieldErrors('economy_keys', draftFromRecord(record('economy_keys', { keys: [] })))).toEqual({})
  })

  it('validFieldNumber는 통과한 숫자만 돌려준다', () => {
    expect(validFieldNumber('6', 1)).toBe(6)
    expect(validFieldNumber('0', 1)).toBeNull()
    expect(validFieldNumber('0', 0)).toBe(0)
    expect(validFieldNumber('x', 0)).toBeNull()
  })
})

describe('결과 문장(채원 확정 문구)', () => {
  const sentence = (record: OpsRuleRecord, text: string, path?: string) => {
    const key = record.ruleKey as Parameters<typeof ruleFieldSpecs>[0]
    const spec = ruleFieldSpecs(key).find((s) => !path || s.path === path)!
    return resultSentence(key, spec, withText(draftFromRecord(record), spec.path, text))
  }

  it('R1: 값 6 → 「열려 있을 컬렉션이 7개째가 되면 알려요」', () => {
    expect(sentence(R1, '6')).toBe('열려 있을 컬렉션이 7개째가 되면 알려요')
  })

  it('R2: 값 1 → 「한 주(월~일)에 2개째부터 알려요」', () => {
    expect(sentence(R2, '1')).toBe('한 주(월~일)에 2개째부터 알려요')
  })

  it('R3: 값 2 → 「공개 시각부터 거슬러 28일 안에 3개째부터 알려요. 예약·게재 중인 다른 기획도 같이 세요」', () => {
    expect(sentence(R3, '2')).toBe('공개 시각부터 거슬러 28일 안에 3개째부터 알려요. 예약·게재 중인 다른 기획도 같이 세요')
  })

  it('R4: 값 28 → 「공개까지 28일보다 적게 남으면 알려요」', () => {
    expect(sentence(R4, '28')).toBe('공개까지 28일보다 적게 남으면 알려요')
  })

  it('R5: 종류마다 「N 포인트를 넘으면 알려요」', () => {
    expect(sentence(R5, '50', 'kinds.mission.max')).toBe('50 포인트를 넘으면 알려요')
    expect(sentence(R5, '0', 'kinds.recipe.max')).toBe('0 포인트를 넘으면 알려요')
  })

  it('값을 고치는 동안 바로 바뀐다', () => {
    expect(sentence(R1, '10')).toBe('열려 있을 컬렉션이 11개째가 되면 알려요')
  })

  it('칸이 통과하지 못하면 문장이 없다(오류 문장이 대신 보인다)', () => {
    expect(sentence(R1, '')).toBeNull()
    expect(sentence(R1, '1.5')).toBeNull()
    expect(sentence(R1, '0')).toBeNull()
    expect(sentence(R5, '-1', 'kinds.mission.max')).toBeNull()
  })
})

describe('저장 전 표시와 저장 본문', () => {
  it('바뀐 것이 없으면 any가 거짓이고 저장 본문은 비어 있다', () => {
    const draft = draftFromRecord(R1)
    expect(draftChanges(R1, draft)).toEqual({ enabled: false, level: false, value: false, paths: [], any: false })
    expect(draftToPatch(R1, draft)).toEqual({})
  })

  it('바꾼 칸·임시값·수준·켜기를 각각 알아본다', () => {
    const base = draftFromRecord(R1)
    expect(draftChanges(R1, withText(base, 'max', '7'))).toMatchObject({ value: true, paths: ['max'], any: true })
    expect(draftChanges(R1, { ...base, provisional: { provisional: false } })).toMatchObject({ value: true, paths: ['provisional'], any: true })
    expect(draftChanges(R1, { ...base, level: 'info' })).toMatchObject({ level: true, value: false, any: true })
    expect(draftChanges(R1, { ...base, enabled: false })).toMatchObject({ enabled: true, any: true })
  })

  it('고쳤다가 원래 값으로 돌리면 바뀐 것이 없다', () => {
    const base = draftFromRecord(R1)
    expect(draftChanges(R1, withText(withText(base, 'max', '7'), 'max', '6')).any).toBe(false)
  })

  it('저장 본문은 바뀐 것만 담는다(값은 칸 전체)', () => {
    const base = draftFromRecord(R1)
    expect(draftToPatch(R1, { ...withText(base, 'max', '9'), level: 'info' })).toEqual({
      value: { max: 9, provisional: true },
      level: 'info',
    })
    expect(draftToPatch(R1, { ...base, enabled: false })).toEqual({ enabled: false })
  })

  it('R5는 종류 전체를 보낸다', () => {
    const body = draftToPatch(R5, withText(draftFromRecord(R5), 'kinds.mission.max', '40'))
    expect(body.value).toEqual({
      kinds: {
        count_badge: { max: 10, provisional: true },
        achievement_badge: { max: 100, provisional: false },
        mission: { max: 40, provisional: true },
        collection_completion: { max: 20, provisional: false },
        recipe: { max: 30, provisional: false },
      },
    })
  })

  it('R6·R7·R8은 켜기·수준만 보낸다(값은 절대 보내지 않는다)', () => {
    for (const key of ['single_action_points', 'count_ladder_points', 'economy_keys']) {
      const rec = record(key, key === 'economy_keys' ? { keys: ['a'] } : {})
      const body = draftToPatch(rec, { ...draftFromRecord(rec), enabled: false, level: 'info' })
      expect(body).toEqual({ enabled: false, level: 'info' })
    }
  })

  it('임시값이 켜진 칸의 값을 바꾸면 힌트가 뜬다(저장은 막지 않는다). 임시값이 꺼져 있거나 수준만 바꾸면 뜨지 않는다', () => {
    const base = draftFromRecord(R1)
    expect(shouldHintProvisional(R1, withText(base, 'max', '7'))).toBe(true)
    expect(shouldHintProvisional(R1, base)).toBe(false)
    expect(shouldHintProvisional(R1, { ...base, level: 'info' })).toBe(false)
    expect(shouldHintProvisional(R1, withText({ ...base, provisional: { provisional: false } }, 'max', '7'))).toBe(false)
    expect(shouldHintProvisional(R4, withText(draftFromRecord(R4), 'min_days', '30'))).toBe(false) // R4는 확정값
  })
})

describe('R1 「지금 서비스」 상자', () => {
  it('기준보다 많이 열려 있으면: 「…기준(6개)보다 24개 많아서 새 컬렉션을 여는 기획에는 주의가 계속 떠요.」', () => {
    expect(openCollectionsNote(30, '6', 'warn')).toBe(
      '지금 열린 컬렉션은 30개예요. 기준(6개)보다 24개 많아서 새 컬렉션을 여는 기획에는 주의가 계속 떠요.'
    )
  })

  it('경고 수준을 참고로 두면 참고로 말한다', () => {
    expect(openCollectionsNote(30, '6', 'info')).toContain('참고가 계속 떠요')
  })

  it('기준과 같으면 새 컬렉션 하나를 더 열 때 뜬다, 기준보다 적으면 더 열 수 있는 수를 말한다', () => {
    expect(openCollectionsNote(6, '6', 'warn')).toBe('지금 열린 컬렉션은 6개예요. 기준(6개)과 같아서 새 컬렉션을 하나 더 열면 주의가 떠요.')
    expect(openCollectionsNote(4, '6', 'warn')).toBe('지금 열린 컬렉션은 4개예요. 기준(6개)까지 2개 더 열 수 있어요.')
  })

  it('값 칸이 틀리면 열린 수만 말하고(고치는 중), 열린 수를 못 읽으면 그 사실만 말한다', () => {
    expect(openCollectionsNote(30, '', 'warn')).toBe('지금 열린 컬렉션은 30개예요.')
    expect(openCollectionsNote(30, 'abc', 'warn')).toBe('지금 열린 컬렉션은 30개예요.')
    expect(openCollectionsNote(null, '6', 'warn')).toBe('열린 컬렉션 수를 읽지 못했어요')
  })

  it('고치는 중인 값으로 바로 바뀐다', () => {
    expect(openCollectionsNote(30, '40', 'warn')).toBe('지금 열린 컬렉션은 30개예요. 기준(40개)까지 10개 더 열 수 있어요.')
  })
})

describe('R6·R7·R8 읽기 전용 표시', () => {
  it('R6은 미션·컬렉션 완성 값을, R7은 달성형 값을 보여 준다(R5를 따른다)', () => {
    const r5 = readPointRewardValue(R5)
    expect(derivedPointsText('single_action_points', r5)).toBe('미션 50 포인트 · 컬렉션 완성 20 포인트')
    expect(derivedPointsText('count_ladder_points', r5)).toBe('100 포인트')
  })

  it('R5를 바꿔 저장하면 따라 바뀐다', () => {
    const changed = record('point_reward_max', {
      kinds: { ...R5_VALUE.kinds, mission: { max: 40, provisional: false }, achievement_badge: { max: 80, provisional: false } },
    })
    const r5 = readPointRewardValue(changed)
    expect(derivedPointsText('single_action_points', r5)).toBe('미션 40 포인트 · 컬렉션 완성 20 포인트')
    expect(derivedPointsText('count_ladder_points', r5)).toBe('80 포인트')
  })

  it('R5를 읽을 수 없으면 null이다(화면이 읽을 수 없다는 문장을 보인다)', () => {
    expect(readPointRewardValue(undefined)).toBeNull()
    expect(readPointRewardValue(record('point_reward_max', { kinds: {} }))?.kinds.mission).toBeNull()
    expect(derivedPointsText('single_action_points', null)).toBeNull()
    expect(derivedPointsText('count_ladder_points', readPointRewardValue(record('point_reward_max', { kinds: {} })))).toBeNull()
  })

  it('R8은 키 목록을 그대로, 못 읽으면 빈 목록이다', () => {
    expect(economyKeysOf(record('economy_keys', { keys: ['rarity_common', 'bonus_drop_rate'] }))).toEqual(['rarity_common', 'bonus_drop_rate'])
    expect(economyKeysOf(record('economy_keys', { keys: 'x' }))).toEqual([])
    expect(economyKeysOf(undefined)).toEqual([])
  })
})

describe('마지막 변경과 직전 값', () => {
  it('한 번도 안 바꿨으면 「처음 값 그대로예요」 한 줄이다', () => {
    expect(lastChangeLines(R1)).toEqual({ changed: '처음 값 그대로예요', previous: null })
  })

  it('바꿨으면 「마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20」과 「직전 값 6개」다', () => {
    const changed = record('open_collections_max', { max: 9, provisional: false }, { edited: true, previousValue: { max: 6, provisional: true } })
    expect(lastChangeLines(changed)).toEqual({ changed: '마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20', previous: '직전 값 6개' })
  })

  it('켜기·수준만 바꿨으면 값은 처음 그대로라고 말한다', () => {
    const toggled = record('open_collections_max', R1.value, { edited: true })
    expect(lastChangeLines(toggled).previous).toBe('값은 처음 그대로예요')
  })

  it('직전 값 글: R1~R3 개, R4 일, R5 종류별 포인트', () => {
    expect(previousValueText('weekly_new_collections_max', { max: 1, provisional: true })).toBe('1개')
    expect(previousValueText('launch_lead_days_min', { min_days: 21, provisional: false })).toBe('21일')
    expect(previousValueText('point_reward_max', R5_VALUE)).toBe('횟수형 JAM! 배지 10 · 달성형 JAM! 배지 100 · 미션 50 · 컬렉션 완성 20 · 레시피 30 포인트')
    expect(previousValueText('open_collections_max', null)).toBeNull()
    expect(previousValueText('open_collections_max', { max: 'x' })).toBeNull()
  })

  it('직전 값을 읽을 수 없으면 그 사실을 말한다', () => {
    const broken = record('open_collections_max', R1.value, { edited: true, previousValue: { max: 'x' } })
    expect(lastChangeLines(broken).previous).toBe('직전 값을 읽을 수 없어요')
  })

  it('직전 값으로 되돌릴 수 있는 것은 직전 값이 있고 저장 규칙을 통과할 때다', () => {
    expect(canRevertToPrevious(R1)).toBe(false)
    expect(canRevertToPrevious(record('open_collections_max', R1.value, { previousValue: { max: 6, provisional: true } }))).toBe(true)
    expect(canRevertToPrevious(record('open_collections_max', R1.value, { previousValue: { max: 0, provisional: true } }))).toBe(false)
    expect(canRevertToPrevious(record('economy_keys', { keys: [] }, { previousValue: { keys: [] } }))).toBe(false)
  })

  it('저장 성공 토스트 제목은 「<규칙 이름> 기준을 바꿨어요」다', () => {
    expect(savedToastTitle('동시 개방 컬렉션 수')).toBe('동시 개방 컬렉션 수 기준을 바꿨어요')
  })
})

describe('임시값 칩', () => {
  it('임시값 표시가 켜진 칸이 있으면 규칙에 칩이 붙고, R4(확정값)와 R6~R8은 붙지 않는다', () => {
    expect(recordHasProvisional(R1)).toBe(true)
    expect(recordHasProvisional(R5)).toBe(true) // 횟수형·미션이 임시값
    expect(recordHasProvisional(R4)).toBe(false)
    expect(recordHasProvisional(record('single_action_points', {}))).toBe(false)
    expect(recordHasProvisional(record('open_collections_max', { max: 'x' }))).toBe(false)
  })
})
