/**
 * 확률 안내의 등급 올리기 표 데이터 (티켓 20261022_2119 4회, 운영 로직 8.4·18.3절, 채원 사전 판정 2026-10-23)
 *
 * 고정하는 것:
 * - 기본 설정(캡슐 70/22/6/2, 다른 트라이브 0.2)에서 재료 등급별 표 값이 정확히 Common 5개 70/22/6/2, Rare 5개 73.33/20/6.67, Epic 5개 75/25이고
 *   재료보다 낮은 등급 줄이 없으며, 트라이브 표 한 줄이 20%다.
 * - 값은 읽은 설정에서 만든다: 캡슐 등급을 60/25/10/5로 바꾸면 Rare 5개가 62.5/25/12.5가 된다. 문자열로 박힌 숫자가 없다.
 * - 서버 굴림과 같은 함수: 표의 값이 `tierUpProbabilities`의 출력을 `formatFraction`으로 바꾼 것과 같다.
 * - 확률 0인 줄도 남는다. 넣은 등급 이상이 모두 0이면 자기 등급 100% 한 줄이다.
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

import { ALL_OK, CAPSULE_ROW, JAM_ROW, fakeClient, ok } from './fixtures'
import { TIER_UP_MATERIAL_COUNT, TIER_UP_MATERIAL_RARITIES, tierUpProbabilities } from '@/lib/combine/tierUpOdds'
import { buildPolicyDisclosure, formatFraction, loadProbabilityDisclosure, type PolicyDisclosure, type TierUpMaterialDisclosure } from '../disclosure'

const asMap = (rows: { label: string; value: string }[]) => Object.fromEntries(rows.map((r) => [r.label, r.value]))
const labelsOf = (m: TierUpMaterialDisclosure) => m.rows.map((r) => r.label)

async function loadTierUp(results = ALL_OK): Promise<PolicyDisclosure['tierUp']> {
  const result = await loadProbabilityDisclosure(fakeClient(results).client)
  if (!result.policy.ok) throw new Error('정책 읽기가 실패했다')
  return result.policy.data.tierUp
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

describe('기본 설정 — 재료 등급마다 «넣은 등급 이상» 줄만 있는 표', () => {
  it('Common, Rare, Epic 순서로 표가 세 개이고 Mystic은 재료가 아니다', async () => {
    const { materials } = await loadTierUp()
    expect(materials.map((m) => m.heading)).toEqual(['Common 5개를 넣으면', 'Rare 5개를 넣으면', 'Epic 5개를 넣으면'])
    expect(materials).toHaveLength(TIER_UP_MATERIAL_RARITIES.length)
    expect(materials.some((m) => m.heading.includes('Mystic'))).toBe(false)
  })

  it('Common 5개: 70 / 22 / 6 / 2', async () => {
    const [common] = (await loadTierUp()).materials
    expect(common.rows).toEqual([
      { label: 'Common', value: '70%' },
      { label: 'Rare', value: '22%' },
      { label: 'Epic', value: '6%' },
      { label: 'Mystic', value: '2%' },
    ])
  })

  it('Rare 5개: 73.33 / 20 / 6.67 이고 Common 줄이 없다', async () => {
    const rare = (await loadTierUp()).materials[1]
    expect(rare.rows).toEqual([
      { label: 'Rare', value: '73.33%' },
      { label: 'Epic', value: '20%' },
      { label: 'Mystic', value: '6.67%' },
    ])
  })

  it('Epic 5개: 75 / 25 이고 낮은 등급 줄이 없다', async () => {
    const epic = (await loadTierUp()).materials[2]
    expect(epic.rows).toEqual([
      { label: 'Epic', value: '75%' },
      { label: 'Mystic', value: '25%' },
    ])
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

  it('트라이브 표는 «다른 트라이브의 것일 확률 20%» 한 줄이다', async () => {
    const { tribe } = await loadTierUp()
    expect(tribe).toEqual([{ label: '다른 트라이브의 것일 확률', value: '20%' }])
  })
})

describe('값은 읽은 설정에서 만든다 — 설정을 바꾸면 표가 따라 바뀐다', () => {
  const changed = {
    ...ALL_OK,
    capsule_policy: ok({ ...CAPSULE_ROW, rarity_common: 60, rarity_rare: 25, rarity_epic: 10, rarity_mystic: 5, other_tribe_probability: 0.35 }),
  }

  it('캡슐 등급을 60/25/10/5로 바꾸면 Rare 5개가 62.5 / 25 / 12.5가 된다', async () => {
    const { materials } = await loadTierUp(changed)
    expect(asMap(materials[0].rows)).toEqual({ Common: '60%', Rare: '25%', Epic: '10%', Mystic: '5%' })
    expect(asMap(materials[1].rows)).toEqual({ Rare: '62.5%', Epic: '25%', Mystic: '12.5%' })
    expect(asMap(materials[2].rows)).toEqual({ Epic: '66.67%', Mystic: '33.33%' })
  })

  it('다른 트라이브 확률을 바꾸면 트라이브 표가 따라 바뀐다', async () => {
    const { tribe } = await loadTierUp(changed)
    expect(tribe).toEqual([{ label: '다른 트라이브의 것일 확률', value: '35%' }])
  })

  it('바뀌기 전 값은 남지 않는다', async () => {
    const tierUp = await loadTierUp(changed)
    const values = [...tierUp.materials.flatMap((m) => m.rows), ...tierUp.tribe].map((r) => r.value)
    for (const stale of ['70%', '22%', '73.33%', '6.67%', '75%', '20%']) expect(values, stale).not.toContain(stale)
  })

  it('NUMERIC 칸이 문자열로 내려와도 같은 표가 나온다', async () => {
    const asStrings = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v]))
    const fromStrings = await loadTierUp({ ...ALL_OK, capsule_policy: ok(asStrings(CAPSULE_ROW)) })
    expect(fromStrings).toEqual(await loadTierUp())
  })
})

describe('서버 굴림과 같은 함수 — 표의 값이 tierUpProbabilities의 출력이다', () => {
  it.each([
    ['기본 설정', { rarity_common: 70, rarity_rare: 22, rarity_epic: 6, rarity_mystic: 2 }],
    ['60/25/10/5', { rarity_common: 60, rarity_rare: 25, rarity_epic: 10, rarity_mystic: 5 }],
    ['50/30/15/5', { rarity_common: 50, rarity_rare: 30, rarity_epic: 15, rarity_mystic: 5 }],
    ['Epic 0', { rarity_common: 80, rarity_rare: 20, rarity_epic: 0, rarity_mystic: 0 }],
  ])('%s', (_name, rarity) => {
    const capsule = { ...CAPSULE_ROW, ...rarity }
    const d = buildPolicyDisclosure(capsule, JAM_ROW)!
    TIER_UP_MATERIAL_RARITIES.forEach((material, i) => {
      const expected = tierUpProbabilities(material, capsule).map(([r, p]) => ({
        label: r.charAt(0).toUpperCase() + r.slice(1),
        value: formatFraction(p),
      }))
      expect(d.tierUp.materials[i].rows).toEqual(expected)
    })
  })
})

describe('0인 값', () => {
  it('확률 0인 줄도 지우지 않고 «0%»로 쓴다', () => {
    const d = buildPolicyDisclosure({ ...CAPSULE_ROW, rarity_common: 80, rarity_rare: 20, rarity_epic: 0, rarity_mystic: 0 }, JAM_ROW)!
    expect(asMap(d.tierUp.materials[0].rows)).toEqual({ Common: '80%', Rare: '20%', Epic: '0%', Mystic: '0%' })
    expect(asMap(d.tierUp.materials[1].rows)).toEqual({ Rare: '100%', Epic: '0%', Mystic: '0%' })
  })

  it('넣은 등급 이상의 설정 확률이 모두 0이면 자기 등급 100% 한 줄을 그대로 보인다', () => {
    const d = buildPolicyDisclosure({ ...CAPSULE_ROW, rarity_common: 100, rarity_rare: 0, rarity_epic: 0, rarity_mystic: 0 }, JAM_ROW)!
    const [common, rare, epic] = d.tierUp.materials
    expect(asMap(common.rows)).toEqual({ Common: '100%', Rare: '0%', Epic: '0%', Mystic: '0%' })
    expect(rare.rows).toEqual([{ label: 'Rare', value: '100%' }])
    expect(epic.rows).toEqual([{ label: 'Epic', value: '100%' }])
    expect(labelsOf(rare)).not.toContain('Common')
  })

  it('다른 트라이브 확률 0은 «0%»로 쓴다', () => {
    const d = buildPolicyDisclosure({ ...CAPSULE_ROW, other_tribe_probability: 0 }, JAM_ROW)!
    expect(d.tierUp.tribe).toEqual([{ label: '다른 트라이브의 것일 확률', value: '0%' }])
  })
})

describe('틀린 표를 보이지 않는다 / 읽는 칸이 늘지 않는다', () => {
  it('캡슐 등급 합계가 100이 아니면 등급 올리기 표까지 함께 null이다', () => {
    expect(buildPolicyDisclosure({ ...CAPSULE_ROW, rarity_common: 70, rarity_rare: 22, rarity_epic: 6, rarity_mystic: 3 }, JAM_ROW)).toBeNull()
  })

  it('등급 올리기 때문에 읽는 칸이 늘지 않는다 — 캡슐 표는 기존 칸만 읽는다', async () => {
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
    for (const name of ['TIER_UP_MATERIAL_COUNT', 'TIER_UP_MATERIAL_RARITIES', 'isTierUpMaterialRarity', 'tierUpProbabilities', 'TierUpMaterialRarity', 'TierUpRarityPolicy']) {
      expect(source, name).toMatch(new RegExp(`export (type )?\\{[^}]*\\b${name}\\b`))
    }
  })
})
