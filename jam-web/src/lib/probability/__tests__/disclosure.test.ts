/**
 * lib/probability/disclosure — 확률 안내 값 읽기 (티켓 20261021_1250 1회, 운영 로직 18.3절)
 *
 * 고정하는 것:
 * - 값은 읽은 행에서 만든다: 설정을 바꾼 행으로 만들면 표가 따라 바뀐다.
 * - 단위 변환: 정책 표의 등급은 퍼센트(70), 확률 칸은 0~1(0.2), 시스템 드랍 등급은 0~1(1, 0, 0, 0)이다. 부동소수 오차(0.07)도 정리한다.
 * - 0인 값: 등급 0% 줄은 지우지 않고, 확정 개수 0은 «0개», 보너스 개수 0은 «없음»이다.
 * - 읽기에 실패하면 코드 상수 사본(`DEFAULT_*`)으로 대신하지 않고 `{ ok: false }`만 돌려준다(숫자가 하나도 없다).
 *   정책(동기화·캡슐·보정 장치)과 시스템 드랍은 따로 실패한다.
 * - 필요한 칸만 이름으로 읽는다(`select('*')`와 대량 수령 경보 기준 칸이 없다).
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/probability/__tests__/disclosure.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createServiceClientMock } = vi.hoisted(() => ({ createServiceClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createServiceClientMock }))

import { ALL_OK, AMBIENT_ROW, CAPSULE_ROW, JAM_ROW, fakeClient, failed, ok, type Result } from './fixtures'
import { DEFAULT_CAPSULE_POLICY } from '@/lib/capsule/policy'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import { DEFAULT_AMBIENT_DROP_CONFIG } from '@/lib/ambient-drop/config'
import {
  buildAmbientDisclosure,
  buildPolicyDisclosure,
  formatFraction,
  formatPercentPoints,
  loadProbabilityDisclosure,
  type AmbientDisclosure,
  type DisclosureRow,
  type PolicyDisclosure,
  type ProbabilityDisclosure,
} from '../disclosure'

function policyOf(d: ProbabilityDisclosure): PolicyDisclosure {
  if (!d.policy.ok) throw new Error('정책 읽기가 실패했다')
  return d.policy.data
}

function ambientOf(d: ProbabilityDisclosure): AmbientDisclosure {
  if (!d.ambient.ok) throw new Error('시스템 드랍 읽기가 실패했다')
  return d.ambient.data
}

const asMap = (rows: DisclosureRow[]) => Object.fromEntries(rows.map((r) => [r.label, r.value]))

/** 결과에 들어 있는 모든 문자열 */
function allStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) node.forEach((n) => allStrings(n, out))
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => allStrings(n, out))
  return out
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

describe('정상 값 — 운영 로직 5.4·6.7절 표와 같은 표 행', () => {
  it('동기화: 개수, 보너스 2회 규칙, 잠김, 등급 표', async () => {
    const result = await loadProbabilityDisclosure(fakeClient(ALL_OK).client)
    const sync = policyOf(result).sync
    expect(sync.counts).toEqual([
      { label: '확정으로 받는 개수', value: '1개, 등산은 2개' },
      { label: '보너스 기회', value: '2번' },
      { label: '보너스 한 번의 확률', value: '활동의 잼 ÷ 600, 최대 25%' },
      { label: '잠긴 채 받을 확률', value: '25%' },
    ])
    // 서열 순, 영문
    expect(sync.rarity).toEqual([
      { label: 'Common', value: '84%' },
      { label: 'Rare', value: '13%' },
      { label: 'Epic', value: '2.5%' },
      { label: 'Mystic', value: '0.5%' },
    ])
  })

  it('캡슐: 확정 1개와 보너스 1개, 다른 트라이브, 잠김, 첫 캡슐 잠금, 등급 표', async () => {
    const result = await loadProbabilityDisclosure(fakeClient(ALL_OK).client)
    const capsule = policyOf(result).capsule
    expect(capsule.counts).toEqual([
      { label: '확정으로 나오는 개수', value: '1개' },
      { label: '1개 더 나올 확률', value: '20%' },
      { label: '다른 트라이브의 것일 확률', value: '아이템 배지마다 20%' },
      // 잠김은 동기화와 캡슐이 한 값이다(jam_policy.locked_roll_probability)
      { label: '잠긴 채 나올 확률', value: '25%' },
      { label: 'JAM! 시작하기에서 여는 첫 캡슐', value: '잠긴 아이템 배지 1개가 반드시 나와요' },
    ])
    expect(capsule.rarity).toEqual([
      { label: 'Common', value: '70%' },
      { label: 'Rare', value: '22%' },
      { label: 'Epic', value: '6%' },
      { label: 'Mystic', value: '2%' },
    ])
  })

  it('보정 장치 두 가지가 숫자와 함께 사실 문장으로 나온다', async () => {
    const pity = policyOf(await loadProbabilityDisclosure(fakeClient(ALL_OK).client)).pity
    expect(pity).toHaveLength(2)
    expect(pity[0]).toBe('내가 캡슐을 15번 여는 동안 Epic 이상이 나오지 않으면, 그다음 캡슐의 첫 아이템 배지는 Epic 이상으로 나와요.')
    expect(pity[1]).toBe(
      'Common 아이템 배지가 10번 이어서 나오면, 그다음 아이템 배지는 Rare 이상으로 나와요. 동기화와 캡슐에서 나온 것을 합쳐서 세어요.'
    )
  })

  it('시스템 드랍 explicit: 등급 표에 0%인 줄도 그대로 있다', async () => {
    const ambient = ambientOf(await loadProbabilityDisclosure(fakeClient(ALL_OK).client))
    expect(ambient).toEqual({
      mode: 'explicit',
      rarity: [
        { label: 'Common', value: '100%' },
        { label: 'Rare', value: '0%' },
        { label: 'Epic', value: '0%' },
        { label: 'Mystic', value: '0%' },
      ],
    })
  })

  it('시스템 드랍 random: 표 없이 모드만 돌려준다(등급 값을 읽지 않는다)', async () => {
    const result = await loadProbabilityDisclosure(
      fakeClient({ ...ALL_OK, ambient_drop_config: ok({ rarity_mode: 'random' }) }).client
    )
    expect(ambientOf(result)).toEqual({ mode: 'random' })
  })

  it('유저에게 쓰지 않는 말과 번호 붙은 보정 이름이 없다', async () => {
    const strings = allStrings(await loadProbabilityDisclosure(fakeClient(ALL_OK).client))
    const banned = ['퀘스트', '랜덤', '개체', '후보', '발급', '섀도우밴', 'POI', '보정 1', '보정 2', 'UP', '꽝']
    for (const word of banned) {
      expect(
        strings.filter((s) => s.includes(word)),
        `«${word}»가 들어 있는 문구`
      ).toEqual([])
    }
  })
})

describe('값은 읽은 행에서 만든다 — 설정을 바꾸면 표가 따라 바뀐다', () => {
  it('캡슐·동기화 값을 바꾼 행으로 만들면 표 행이 그 값이다', async () => {
    const result = await loadProbabilityDisclosure(
      fakeClient({
        ...ALL_OK,
        capsule_policy: ok({
          ...CAPSULE_ROW,
          guaranteed_count: 2,
          bonus_count: 3,
          bonus_probability: 0.35,
          other_tribe_probability: 0.5,
          rarity_common: 50,
          rarity_rare: 30,
          rarity_epic: 15,
          rarity_mystic: 5,
          pity_epic_threshold: 20,
        }),
        jam_policy: ok({
          ...JAM_ROW,
          sync_item_guaranteed: 3,
          sync_item_guaranteed_hiking: 3,
          sync_item_bonus_rolls: 1,
          sync_item_bonus_jam_divisor: 400,
          sync_item_bonus_max_probability: 0.4,
          sync_rarity_common: 60,
          sync_rarity_rare: 25,
          sync_rarity_epic: 10,
          sync_rarity_mystic: 5,
          common_streak_threshold: 7,
          locked_roll_probability: 0.1,
        }),
      }).client
    )
    const { sync, capsule, pity } = policyOf(result)
    expect(asMap(sync.counts)).toEqual({
      '확정으로 받는 개수': '3개', // 등산도 같으면 «등산은»을 쓰지 않는다
      '보너스 기회': '1번',
      '보너스 한 번의 확률': '활동의 잼 ÷ 400, 최대 40%',
      '잠긴 채 받을 확률': '10%',
    })
    expect(asMap(sync.rarity)).toEqual({ Common: '60%', Rare: '25%', Epic: '10%', Mystic: '5%' })
    expect(asMap(capsule.counts)).toMatchObject({
      '확정으로 나오는 개수': '2개',
      '3개 더 나올 확률': '35%', // 라벨의 숫자는 bonus_count에서 만든다
      '다른 트라이브의 것일 확률': '아이템 배지마다 50%',
      '잠긴 채 나올 확률': '10%',
    })
    expect(asMap(capsule.rarity)).toEqual({ Common: '50%', Rare: '30%', Epic: '15%', Mystic: '5%' })
    expect(pity[0]).toContain('20번')
    expect(pity[1]).toContain('7번')
  })

  it('시스템 드랍 등급을 바꾸면 표가 따라 바뀐다', async () => {
    const result = await loadProbabilityDisclosure(
      fakeClient({
        ...ALL_OK,
        ambient_drop_config: ok({ rarity_mode: 'explicit', rarity_common: 0.6, rarity_rare: 0.3, rarity_epic: 0.07, rarity_mystic: 0.03 }),
      }).client
    )
    expect(asMap((ambientOf(result) as Extract<AmbientDisclosure, { mode: 'explicit' }>).rarity)).toEqual({
      Common: '60%',
      Rare: '30%',
      Epic: '7%', // 0.07 * 100 = 7.000000000000001 을 정리한다
      Mystic: '3%',
    })
  })
})

describe('단위 변환 — 읽는 곳마다 고정한다', () => {
  it('0~1 확률은 100을 곱해 퍼센트로, 소수는 필요한 자리까지만 쓴다', () => {
    expect(formatFraction(0.2)).toBe('20%')
    expect(formatFraction(0.25)).toBe('25%')
    expect(formatFraction(0.07)).toBe('7%')
    expect(formatFraction(0.125)).toBe('12.5%')
    expect(formatFraction(0)).toBe('0%')
    expect(formatFraction(1)).toBe('100%')
    expect(formatFraction(0.0005)).toBe('0.05%')
  })

  it('이미 퍼센트인 등급 값은 곱하지 않는다', () => {
    expect(formatPercentPoints(70)).toBe('70%')
    expect(formatPercentPoints(2.5)).toBe('2.5%')
    expect(formatPercentPoints(0.5)).toBe('0.5%')
    expect(formatPercentPoints(0)).toBe('0%')
  })

  it('NUMERIC 칸이 문자열로 내려와도 같은 표가 나온다', async () => {
    const asStrings = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v]))
    const result = await loadProbabilityDisclosure(
      fakeClient({
        capsule_policy: ok(asStrings(CAPSULE_ROW)),
        jam_policy: ok(asStrings(JAM_ROW)),
        ambient_drop_config: ok(asStrings(AMBIENT_ROW)),
      }).client
    )
    const expected = await loadProbabilityDisclosure(fakeClient(ALL_OK).client)
    expect(result).toEqual(expected)
  })
})

describe('0인 값의 표시', () => {
  const capsuleWith = (over: Partial<typeof CAPSULE_ROW>) => ({ ...CAPSULE_ROW, ...over })
  const jamWith = (over: Partial<typeof JAM_ROW>) => ({ ...JAM_ROW, ...over })

  it('확정 개수 0은 «0개»로 쓴다(드랍 없음 설정이 가능하다)', () => {
    const d = buildPolicyDisclosure(capsuleWith({ guaranteed_count: 0 }), jamWith({ sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0 }))
    expect(d).not.toBeNull()
    expect(asMap(d!.sync.counts)['확정으로 받는 개수']).toBe('0개')
    expect(asMap(d!.capsule.counts)['확정으로 나오는 개수']).toBe('0개')
  })

  it('캡슐 보너스 개수 0이면 보너스 줄을 «없음»으로 쓴다', () => {
    const d = buildPolicyDisclosure(capsuleWith({ bonus_count: 0 }), JAM_ROW)!
    expect(asMap(d.capsule.counts)['더 나오는 개수']).toBe('없음')
    expect(d.capsule.counts.some((r) => r.label.includes('더 나올 확률'))).toBe(false)
  })

  it('동기화 보너스 기회 0이면 «없음»이고 보너스 확률 줄은 없다', () => {
    const d = buildPolicyDisclosure(CAPSULE_ROW, jamWith({ sync_item_bonus_rolls: 0 }))!
    const counts = asMap(d.sync.counts)
    expect(counts['보너스 기회']).toBe('없음')
    expect(counts).not.toHaveProperty('보너스 한 번의 확률')
  })

  it('확률 0%도 지우지 않고 «0%»로 쓴다', () => {
    const d = buildPolicyDisclosure(
      capsuleWith({ bonus_probability: 0, other_tribe_probability: 0, rarity_common: 100, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 }),
      jamWith({ locked_roll_probability: 0 })
    )!
    expect(asMap(d.capsule.counts)['1개 더 나올 확률']).toBe('0%')
    expect(asMap(d.capsule.counts)['다른 트라이브의 것일 확률']).toBe('아이템 배지마다 0%')
    expect(asMap(d.capsule.counts)['잠긴 채 나올 확률']).toBe('0%')
    expect(asMap(d.capsule.rarity)).toEqual({ Common: '100%', Rare: '0%', Epic: '0%', Mystic: '0%' })
  })

  it('등산 확정 개수가 달라도 한 줄에 쓴다', () => {
    const d = buildPolicyDisclosure(CAPSULE_ROW, jamWith({ sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 1 }))!
    expect(asMap(d.sync.counts)['확정으로 받는 개수']).toBe('0개, 등산은 1개')
  })

  it('시스템 드랍 합계가 1이 아니면 null이다', () => {
    expect(buildAmbientDisclosure({ rarity_mode: 'explicit', rarity_common: 0.5, rarity_rare: 0.3, rarity_epic: 0, rarity_mystic: 0 })).toBeNull()
    expect(buildAmbientDisclosure({ rarity_mode: 'random', rarity_common: 0, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 })).toEqual({ mode: 'random' })
  })
})

describe('읽기 실패 — 기본값으로 대신하지 않는다', () => {
  // 기본값과 겹치지 않는 값으로 DB 행을 만든다. 이 값이 실패 결과에 새거나, 기본값이 대신 나타나면 걸린다.
  const DB_CAPSULE = { ...CAPSULE_ROW, rarity_common: 41, rarity_rare: 33, rarity_epic: 17, rarity_mystic: 9, pity_epic_threshold: 23 }
  const DB_JAM = {
    ...JAM_ROW,
    sync_rarity_common: 51,
    sync_rarity_rare: 29,
    sync_rarity_epic: 15,
    sync_rarity_mystic: 5,
    common_streak_threshold: 13,
    locked_roll_probability: 0.45,
  }

  it('기본값 상수 사본은 DB 행과 다르다(이 시험의 전제)', () => {
    expect(DEFAULT_CAPSULE_POLICY.rarity_common).not.toBe(DB_CAPSULE.rarity_common)
    expect(DEFAULT_JAM_POLICY.sync_rarity_common).not.toBe(DB_JAM.sync_rarity_common)
  })

  const policyFailures: Array<[string, Record<string, Result>]> = [
    ['capsule_policy 조회 오류', { ...ALL_OK, capsule_policy: failed }],
    ['capsule_policy 행 없음', { ...ALL_OK, capsule_policy: { data: null, error: null } }],
    ['capsule_policy 조회 예외', { ...ALL_OK, capsule_policy: 'throw' }],
    ['jam_policy 조회 오류', { ...ALL_OK, jam_policy: failed }],
    ['jam_policy 행 없음', { ...ALL_OK, jam_policy: { data: null, error: null } }],
    ['jam_policy 조회 예외', { ...ALL_OK, jam_policy: 'throw' }],
    ['캡슐 칸 하나가 정책 검증에 걸림(확률 > 1)', { ...ALL_OK, capsule_policy: ok({ ...DB_CAPSULE, bonus_probability: 1.5 }) }],
    ['캡슐 칸 하나가 정책 검증에 걸림(정수가 아닌 확정 개수)', { ...ALL_OK, capsule_policy: ok({ ...DB_CAPSULE, guaranteed_count: 1.5 }) }],
    ['캡슐 칸 하나가 비어 있음', { ...ALL_OK, capsule_policy: ok({ ...DB_CAPSULE, pity_epic_threshold: null }) }],
    ['동기화 칸 하나가 정책 검증에 걸림(나눌 값 0)', { ...ALL_OK, jam_policy: ok({ ...DB_JAM, sync_item_bonus_jam_divisor: 0 }) }],
    ['캡슐 등급 합계가 100이 아님', { ...ALL_OK, capsule_policy: ok({ ...DB_CAPSULE, rarity_mystic: 10 }) }],
    ['동기화 등급 합계가 100이 아님', { ...ALL_OK, jam_policy: ok({ ...DB_JAM, sync_rarity_mystic: 6 }) }],
  ]

  it.each(policyFailures)('%s → 정책은 { ok: false }이고 숫자가 하나도 없다', async (_name, results) => {
    const result = await loadProbabilityDisclosure(fakeClient(results).client)
    expect(result.policy).toEqual({ ok: false })
    expect(JSON.stringify(result.policy)).not.toMatch(/\d/)
    // 시스템 드랍은 따로 읽는다 — 정책 실패에 끌려가지 않는다
    expect(result.ambient.ok).toBe(true)
  })

  it('정책이 정상이면 DB 값이 그대로 나오고 기본값 상수의 값은 나오지 않는다', async () => {
    const result = await loadProbabilityDisclosure(fakeClient({ ...ALL_OK, capsule_policy: ok(DB_CAPSULE), jam_policy: ok(DB_JAM) }).client)
    const policy = policyOf(result)
    expect(asMap(policy.capsule.rarity).Common).toBe('41%')
    expect(asMap(policy.sync.rarity).Common).toBe('51%')
    expect(policy.pity[0]).toContain('23번')
    expect(policy.pity[1]).toContain('13번')
    expect(asMap(policy.sync.counts)['잠긴 채 받을 확률']).toBe('45%')
    const text = JSON.stringify(policy)
    expect(text).not.toContain(String(DEFAULT_CAPSULE_POLICY.pity_epic_threshold) + '번')
    expect(text).not.toContain(`${DEFAULT_JAM_POLICY.sync_rarity_common}%`)
    expect(text).not.toContain(`${DEFAULT_CAPSULE_POLICY.rarity_common}%`)
  })

  const ambientFailures: Array<[string, Result]> = [
    ['조회 오류', failed],
    ['행 없음', { data: null, error: null }],
    ['조회 예외', 'throw'],
    ['모드 값이 비정상', ok({ ...AMBIENT_ROW, rarity_mode: 'all' })],
    ['등급 칸 하나가 범위 밖(1.5)', ok({ ...AMBIENT_ROW, rarity_common: 1.5 })],
    ['등급 합계가 1이 아님', ok({ rarity_mode: 'explicit', rarity_common: 0.5, rarity_rare: 0.2, rarity_epic: 0, rarity_mystic: 0 })],
    ['등급 칸이 비어 있음', ok({ ...AMBIENT_ROW, rarity_rare: null })],
  ]

  it.each(ambientFailures)('시스템 드랍 %s → { ok: false }이고 숫자가 없으며 정책은 영향받지 않는다', async (_name, ambient) => {
    const result = await loadProbabilityDisclosure(fakeClient({ ...ALL_OK, ambient_drop_config: ambient }).client)
    expect(result.ambient).toEqual({ ok: false })
    expect(JSON.stringify(result.ambient)).not.toMatch(/\d/)
    expect(result.policy.ok).toBe(true)
  })

  it('기본 시스템 드랍 설정(Common 100%)은 읽기 실패 때 대신 쓰이지 않는다', async () => {
    expect(DEFAULT_AMBIENT_DROP_CONFIG.rarity_common).toBe(1)
    const result = await loadProbabilityDisclosure(fakeClient({ ...ALL_OK, ambient_drop_config: failed }).client)
    expect(JSON.stringify(result.ambient)).not.toContain('100%')
  })

  it('셋 다 실패해도 던지지 않고 둘 다 { ok: false }다', async () => {
    const result = await loadProbabilityDisclosure(
      fakeClient({ capsule_policy: 'throw', jam_policy: 'throw', ambient_drop_config: 'throw' }).client
    )
    expect(result).toEqual({ policy: { ok: false }, ambient: { ok: false } })
  })

  it('클라이언트를 만들지 못해도 던지지 않고 둘 다 { ok: false }다', async () => {
    createServiceClientMock.mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY 없음')
    })
    const result = await loadProbabilityDisclosure()
    expect(result).toEqual({ policy: { ok: false }, ambient: { ok: false } })
  })

  it('클라이언트를 넘기지 않으면 service 클라이언트를 만들어 읽는다', async () => {
    createServiceClientMock.mockReturnValue(fakeClient(ALL_OK).client)
    const result = await loadProbabilityDisclosure()
    expect(result.policy.ok).toBe(true)
    expect(createServiceClientMock).toHaveBeenCalledTimes(1)
  })
})

describe('읽는 칸', () => {
  it('세 표 모두 칸 이름을 골라 읽는다 — select(*)와 대량 수령 경보 기준 칸이 없다', async () => {
    const fake = fakeClient(ALL_OK)
    await loadProbabilityDisclosure(fake.client)
    expect(Object.keys(fake.selects).sort()).toEqual(['ambient_drop_config', 'capsule_policy', 'jam_policy'])
    for (const columns of Object.values(fake.selects)) {
      expect(columns).not.toContain('*')
      expect(columns).not.toContain('mass_earn_alert')
    }
    expect(fake.selects.capsule_policy.split(', ').sort()).toEqual(Object.keys(CAPSULE_ROW).sort())
    expect(fake.selects.jam_policy.split(', ').sort()).toEqual(Object.keys(JAM_ROW).sort())
    expect(fake.selects.ambient_drop_config.split(', ').sort()).toEqual(Object.keys(AMBIENT_ROW).sort())
  })
})
