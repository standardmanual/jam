/**
 * 확률 안내의 등급 올리기 표 데이터 (티켓 20261022_2119 4회, 20261023_1648 2회, 운영 로직 8.4·18.3절, 채원 사전 판정 2026-10-23)
 *
 * 고정하는 것:
 * - 기본 설정(`combine_policy.tier_up_probability` 0.7)에서 재료 등급별 표 값이 정확히 Common 5개 30/70, Rare 5개 30/70, Epic 5개 30/70이고
 *   줄은 «넣은 등급 그대로»가 먼저, «바로 위 등급»이 아래다. 표는 재료 등급마다 정확히 두 줄이다. 트라이브 표는 없다.
 * - 값은 읽은 설정에서 만든다: 0.5면 50/50, 0.333이면 66.7/33.3이 되고 문자열로 박힌 숫자가 없다. 1 - p의 부동소수 오차(0.30000000000000004)는 «30%»로 정리된다.
 * - 서버 굴림과 같은 함수: 표의 값이 `tierUpProbabilities`의 출력을 `formatFraction`으로 바꾼 것과 같다.
 * - 0과 1: 확률 0인 줄도 남는다(같은 등급 100% / 윗등급 0%, 같은 등급 0% / 윗등급 100%).
 * - 따로 실패한다: `combine_policy`만 읽으며, 읽기 실패·행 없음·칸 없음·숫자가 아님·0~1 밖이면 `{ ok: false }`이고 기본값 0.7로 대신하지 않는다.
 *   반대로 캡슐·동기화 설정이 실패해도 등급 올리기 표는 그대로고, 등급 올리기가 실패해도 정책(동기화·캡슐·보정 장치)은 그대로다.
 * - 가져오는 곳: `disclosure.ts`와 `page.tsx`는 서버 모듈이 딸린 `tierUp.ts`를 직접 가져오지 않고 순수한 `tierUpOdds.ts`만 쓴다(`page.tsx`는 아예 가져오지 않는다).
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/probability/__tests__/tierUpDisclosure.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createServiceClientMock } = vi.hoisted(() => ({ createServiceClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createServiceClientMock }))

import { ALL_OK, CAPSULE_ROW, COMBINE_ROW, failed, fakeClient, ok, type Result } from './fixtures'
import { DEFAULT_COMBINE_POLICY } from '@/lib/combine/policy'
import { TIER_UP_MATERIAL_COUNT, TIER_UP_MATERIAL_RARITIES, tierUpProbabilities } from '@/lib/combine/tierUpOdds'
import { buildTierUpDisclosure, formatFraction, loadProbabilityDisclosure, type TierUpDisclosure, type TierUpMaterialDisclosure } from '../disclosure'

const asMap = (rows: { label: string; value: string }[]) => Object.fromEntries(rows.map((r) => [r.label, r.value]))
const labelsOf = (m: TierUpMaterialDisclosure) => m.rows.map((r) => r.label)
const withProbability = (tier_up_probability: unknown): Record<string, Result> => ({
  ...ALL_OK,
  combine_policy: ok({ ...COMBINE_ROW, tier_up_probability }),
})

async function loadTierUp(results: Record<string, Result> = ALL_OK): Promise<TierUpDisclosure> {
  const result = await loadProbabilityDisclosure(fakeClient(results).client)
  if (!result.tierUp.ok) throw new Error('등급 올리기 읽기가 실패했다')
  return result.tierUp.data
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

describe('기본 설정(0.7) — 재료 등급마다 «넣은 등급 그대로»와 «바로 위 등급» 두 줄', () => {
  it('Common, Rare, Epic 순서로 표가 세 개이고 Mystic은 재료가 아니다', async () => {
    const { materials } = await loadTierUp()
    expect(materials.map((m) => m.heading)).toEqual(['Common 5개를 넣으면', 'Rare 5개를 넣으면', 'Epic 5개를 넣으면'])
    expect(materials).toHaveLength(TIER_UP_MATERIAL_RARITIES.length)
    expect(materials.some((m) => m.heading.includes('Mystic'))).toBe(false)
  })

  it('Common 5개: Common 30% / Rare 70% (낮은 등급이 먼저)', async () => {
    const [common] = (await loadTierUp()).materials
    expect(common.rows).toEqual([
      { label: 'Common', value: '30%' },
      { label: 'Rare', value: '70%' },
    ])
  })

  it('Rare 5개: Rare 30% / Epic 70%', async () => {
    const rare = (await loadTierUp()).materials[1]
    expect(rare.rows).toEqual([
      { label: 'Rare', value: '30%' },
      { label: 'Epic', value: '70%' },
    ])
  })

  it('Epic 5개: Epic 30% / Mystic 70%', async () => {
    const epic = (await loadTierUp()).materials[2]
    expect(epic.rows).toEqual([
      { label: 'Epic', value: '30%' },
      { label: 'Mystic', value: '70%' },
    ])
  })

  it('표는 재료 등급마다 정확히 두 줄이고 재료보다 낮은 등급 줄이 없다', async () => {
    const { materials } = await loadTierUp()
    for (const m of materials) expect(m.rows).toHaveLength(2)
    expect(labelsOf(materials[1])).not.toContain('Common')
    expect(labelsOf(materials[2])).not.toContain('Common')
    expect(labelsOf(materials[2])).not.toContain('Rare')
  })

  it('표마다 caption이 «{등급} 아이템 배지 5개를 넣었을 때 받는 등급 확률»이다', async () => {
    const { materials } = await loadTierUp()
    expect(materials.map((m) => m.caption)).toEqual([
      'Common 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      'Rare 아이템 배지 5개를 넣었을 때 받는 등급 확률',
      'Epic 아이템 배지 5개를 넣었을 때 받는 등급 확률',
    ])
  })

  it('«5개»는 코드 상수 TIER_UP_MATERIAL_COUNT에서 온다', async () => {
    expect(TIER_UP_MATERIAL_COUNT).toBe(5)
    const { materials } = await loadTierUp()
    for (const m of materials) {
      expect(m.heading).toContain(`${TIER_UP_MATERIAL_COUNT}개를 넣으면`)
      expect(m.caption).toContain(`${TIER_UP_MATERIAL_COUNT}개를 넣었을 때`)
    }
  })

  it('트라이브 표가 없다 — 다른 트라이브의 컬렉션은 고를 수 없다', async () => {
    const data = await loadTierUp()
    expect(Object.keys(data)).toEqual(['materials'])
    expect(JSON.stringify(data)).not.toContain('트라이브')
  })

  it('1 - p의 부동소수 오차(0.30000000000000004)가 «30%»로 정리된다', async () => {
    expect(1 - 0.7).not.toBe(0.3)
    const values = (await loadTierUp()).materials.flatMap((m) => m.rows.map((r) => r.value))
    expect(values).toEqual(['30%', '70%', '30%', '70%', '30%', '70%'])
    for (const v of values) expect(v).not.toMatch(/\d{3,}/)
  })
})

describe('값은 읽은 설정에서 만든다 — 설정을 바꾸면 표가 따라 바뀐다', () => {
  it('0.5이면 모든 표가 50% / 50%다', async () => {
    const { materials } = await loadTierUp(withProbability(0.5))
    for (const m of materials) expect(m.rows.map((r) => r.value)).toEqual(['50%', '50%'])
    expect(asMap(materials[0].rows)).toEqual({ Common: '50%', Rare: '50%' })
  })

  it('0.333이면 같은 등급 66.7% / 윗등급 33.3%로 소수 둘째 자리까지 정리된다(부동소수 꼬리 없음)', async () => {
    const { materials } = await loadTierUp(withProbability(0.333))
    expect(materials[0].rows).toEqual([
      { label: 'Common', value: '66.7%' },
      { label: 'Rare', value: '33.3%' },
    ])
    expect(materials[2].rows).toEqual([
      { label: 'Epic', value: '66.7%' },
      { label: 'Mystic', value: '33.3%' },
    ])
  })

  it('0.3333이면 둘째 자리까지 «66.67% / 33.33%»다', async () => {
    const { materials } = await loadTierUp(withProbability(0.3333))
    expect(materials[1].rows.map((r) => r.value)).toEqual(['66.67%', '33.33%'])
  })

  it('바뀌기 전 값은 남지 않는다 (0.7 → 0.4)', async () => {
    const values = (await loadTierUp(withProbability(0.4))).materials.flatMap((m) => m.rows.map((r) => r.value))
    expect(values).toEqual(['60%', '40%', '60%', '40%', '60%', '40%'])
    expect(values).not.toContain('70%')
    expect(values).not.toContain('30%')
  })

  it('NUMERIC 칸이 문자열로 내려와도 같은 표가 나온다', async () => {
    const fromString = await loadTierUp(withProbability('0.7'))
    expect(fromString).toEqual(await loadTierUp())
  })

  it('캡슐·동기화 설정을 바꿔도 등급 올리기 표는 그대로다(더는 캡슐 등급 확률에서 만들지 않는다)', async () => {
    const changedCapsule = {
      ...ALL_OK,
      capsule_policy: ok({ ...CAPSULE_ROW, rarity_common: 60, rarity_rare: 25, rarity_epic: 10, rarity_mystic: 5, other_tribe_probability: 0.35 }),
    }
    expect(await loadTierUp(changedCapsule)).toEqual(await loadTierUp())
  })
})

describe('서버 굴림과 같은 함수 — 표의 값이 tierUpProbabilities의 출력이다', () => {
  it.each([0, 0.2, 0.333, 0.5, 0.7, 0.9, 1])('윗등급 확률 %s', (p) => {
    const d = buildTierUpDisclosure(p)
    TIER_UP_MATERIAL_RARITIES.forEach((material, i) => {
      const expected = tierUpProbabilities(material, p).map(([r, probability]) => ({
        label: r.charAt(0).toUpperCase() + r.slice(1),
        value: formatFraction(probability),
      }))
      expect(d.materials[i].rows).toEqual(expected)
    })
  })

  it('읽은 설정 → 표 → 화면 문자열까지 한 함수를 지난다 (읽기 경로와 buildTierUpDisclosure가 같은 결과다)', async () => {
    expect(await loadTierUp(withProbability(0.35))).toEqual(buildTierUpDisclosure(0.35))
  })
})

describe('0과 1 — 0% 줄을 지우지 않는다', () => {
  it('0이면 같은 등급 100% / 윗등급 0%이고 두 줄이 모두 남는다', async () => {
    const { materials } = await loadTierUp(withProbability(0))
    expect(materials[0].rows).toEqual([
      { label: 'Common', value: '100%' },
      { label: 'Rare', value: '0%' },
    ])
    expect(materials[1].rows).toEqual([
      { label: 'Rare', value: '100%' },
      { label: 'Epic', value: '0%' },
    ])
    expect(materials[2].rows).toEqual([
      { label: 'Epic', value: '100%' },
      { label: 'Mystic', value: '0%' },
    ])
  })

  it('1이면 같은 등급 0% / 윗등급 100%이고 두 줄이 모두 남는다', async () => {
    const { materials } = await loadTierUp(withProbability(1))
    expect(materials[0].rows).toEqual([
      { label: 'Common', value: '0%' },
      { label: 'Rare', value: '100%' },
    ])
    expect(materials[2].rows).toEqual([
      { label: 'Epic', value: '0%' },
      { label: 'Mystic', value: '100%' },
    ])
  })
})

describe('따로 실패한다 — combine_policy만 엄격하게 읽는다', () => {
  const failures: Array<[string, Record<string, Result>]> = [
    ['조회 오류', { ...ALL_OK, combine_policy: failed }],
    ['행 없음', { ...ALL_OK, combine_policy: { data: null, error: null } }],
    ['조회 예외', { ...ALL_OK, combine_policy: 'throw' }],
    ['칸이 아직 없음(마이그레이션 287 전)', { ...ALL_OK, combine_policy: ok({ id: 1, fail_reward_points: 10 }) }],
    ['칸이 비어 있음(null)', withProbability(null)],
    ['숫자가 아님', withProbability('abc')],
    ['0보다 작음', withProbability(-0.1)],
    ['1보다 큼', withProbability(1.5)],
    ['100(퍼센트로 잘못 들어감)', withProbability(70)],
    ['무한대', withProbability(Infinity)],
  ]

  it.each(failures)('%s → 등급 올리기는 { ok: false }이고 숫자가 하나도 없다', async (_name, results) => {
    const result = await loadProbabilityDisclosure(fakeClient(results).client)
    expect(result.tierUp).toEqual({ ok: false })
    expect(JSON.stringify(result.tierUp)).not.toMatch(/\d/)
    // 다른 섹션에 번지지 않는다
    expect(result.policy.ok).toBe(true)
    expect(result.ambient.ok).toBe(true)
  })

  it('읽기가 실패해도 기본값(DEFAULT_COMBINE_POLICY 0.7 → 30% / 70%)으로 대신하지 않는다', async () => {
    expect(DEFAULT_COMBINE_POLICY.tier_up_probability).toBe(0.7)
    const result = await loadProbabilityDisclosure(fakeClient({ ...ALL_OK, combine_policy: failed }).client)
    const text = JSON.stringify(result.tierUp)
    expect(text).not.toContain('70%')
    expect(text).not.toContain('30%')
  })

  it('경계값 0과 1은 정상으로 읽는다', async () => {
    expect((await loadProbabilityDisclosure(fakeClient(withProbability(0)).client)).tierUp.ok).toBe(true)
    expect((await loadProbabilityDisclosure(fakeClient(withProbability(1)).client)).tierUp.ok).toBe(true)
  })

  it.each([
    ['capsule_policy 조회 오류', { ...ALL_OK, capsule_policy: failed }],
    ['jam_policy 조회 예외', { ...ALL_OK, jam_policy: 'throw' as const }],
    ['캡슐 등급 합계가 100이 아님', { ...ALL_OK, capsule_policy: ok({ ...CAPSULE_ROW, rarity_mystic: 10 }) }],
  ])('반대 방향: %s → 정책은 실패해도 등급 올리기 표는 그대로 읽는다', async (_name, results) => {
    const result = await loadProbabilityDisclosure(fakeClient(results).client)
    expect(result.policy).toEqual({ ok: false })
    expect(result.tierUp).toEqual({ ok: true, data: buildTierUpDisclosure(0.7) })
  })

  it('combine_policy는 필요한 칸 하나만 이름으로 읽는다 (select(*) 금지)', async () => {
    const fake = fakeClient(ALL_OK)
    await loadProbabilityDisclosure(fake.client)
    expect(fake.selects.combine_policy).toBe('tier_up_probability')
  })

  it('등급 올리기 때문에 캡슐 표가 읽는 칸이 늘지 않는다 — 캡슐 표는 기존 칸만 읽는다', async () => {
    const fake = fakeClient(ALL_OK)
    await loadProbabilityDisclosure(fake.client)
    expect(fake.selects.capsule_policy.split(', ').sort()).toEqual(Object.keys(CAPSULE_ROW).sort())
  })

  it('표에 들어가는 모든 문자열에 유저 화면에 쓰지 않는 말이 없다', async () => {
    const text = JSON.stringify(await loadTierUp())
    for (const word of ['퀘스트', '랜덤', '개체', '후보', '발급', '소각', '재료', 'UP', '꽝']) expect(text, word).not.toContain(word)
  })
})

describe('가져오는 곳 — 확률 안내는 서버 모듈 없이 순수한 tierUpOdds만 쓴다', () => {
  const root = path.resolve(__dirname, '../../..')
  const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')
  const importsOf = (source: string) => [...source.matchAll(/^import[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])

  it('disclosure.ts는 tierUp.ts를 직접 가져오지 않고 tierUpOdds.ts를 가져온다', () => {
    const imports = importsOf(read('lib/probability/disclosure.ts'))
    expect(imports).not.toContain('@/lib/combine/tierUp')
    expect(imports).toContain('@/lib/combine/tierUpOdds')
  })

  it('disclosure.ts는 getCombinePolicy(기본값 폴백)를 가져오지 않는다 — 윗등급 확률은 표를 직접 읽는다', () => {
    const imports = importsOf(read('lib/probability/disclosure.ts'))
    expect(imports).not.toContain('@/lib/combine/policy')
  })

  it('page.tsx는 tierUp.ts도 tierUpOdds.ts도 직접 가져오지 않는다(표 문자열은 disclosure.ts가 만든다)', () => {
    const imports = importsOf(read('app/(legal)/probability/page.tsx'))
    expect(imports.filter((i) => i.startsWith('@/lib/combine'))).toEqual([])
  })

  it('tierUpOdds.ts는 값으로 가져오는 모듈이 없다(타입만 가져온다)', () => {
    const source = read('lib/combine/tierUpOdds.ts')
    const valueImports = [...source.matchAll(/^import\s+(?!type\b)[^\n]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(valueImports).toEqual([])
  })

  it('tierUp.ts는 순수한 이름을 같은 이름으로 다시 내보낸다', () => {
    const source = read('lib/combine/tierUp.ts')
    for (const name of ['TIER_UP_MATERIAL_COUNT', 'TIER_UP_MATERIAL_RARITIES', 'isTierUpMaterialRarity', 'tierUpProbabilities', 'TierUpMaterialRarity']) {
      expect(source, name).toMatch(new RegExp(`export (type )?\\{[^}]*\\b${name}\\b`))
    }
  })
})
