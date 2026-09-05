/**
 * 계열 단위 배지 관리 — 순수 로직 회귀 (티켓 20260905_0032 B묶음)
 *
 * 지키는 것 네 가지:
 *   ① 계열 그룹핑은 `family_key` 기준이고, 비어 있을 때만 이름으로 폴백한다
 *   ② 일괄 재계산은 **확인(diff) 없이는 쓰지 않는다**
 *   ③ 이미 발급된 `family_key`는 바꿀 수 없다 — 교차 게이트 참조가 조용히 끊긴다
 *   ④ 레벨 생성이 조건 축·이미지를 상속한다
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/badge-families.test.ts`
 */
import {
  applyAxisValue,
  buildFamilyKey,
  buildNextLevelDraft,
  buildRecalculationPlan,
  familyKeySlug,
  findFamilyKeyIssueError,
  findRecalculationConfirmError,
  groupBadgesIntoFamilies,
  isValidFamilyKey,
  nextFamilySlot,
  numericAxisKeysOf,
  proposeFamilyKey,
  type FamilyBadge,
} from '../badge-families'
import type { BadgeCondition, BadgeRarity } from '@/types/database'

let seq = 0
function badge(overrides: Partial<FamilyBadge> = {}): FamilyBadge {
  seq += 1
  return {
    id: `badge-${seq}`,
    name: '밤의 보행자',
    description: '밤에 걷는 사람',
    rarity: 'common' as BadgeRarity | null,
    level: null,
    family_key: 'walking:밤의 보행자',
    sort_order: 5,
    image_url: 'https://cdn.example.com/night.png',
    condition_json: { activity_type: 'walking', distance_km: 10 } as BadgeCondition,
    activity_types: ['walking'],
    deleted_at: null,
    ...overrides,
  }
}

function leveled(level: number, condition: BadgeCondition, overrides: Partial<FamilyBadge> = {}): FamilyBadge {
  return badge({
    rarity: null,
    level,
    family_key: 'walking:night-walker',
    condition_json: condition,
    ...overrides,
  })
}

describe('① 계열 그룹핑은 family_key 기준이고 비어 있으면 폴백한다', () => {
  it('이름이 서로 달라도 family_key가 같으면 한 계열이다', () => {
    const families = groupBadgesIntoFamilies([
      badge({ name: '밤의 보행자', rarity: 'common' }),
      // 어드민이 이름을 고쳐도 계열 키는 그대로다 — 128의 (activity_types, name) 그룹핑이라면
      // 이 배지는 다른 계열로 쪼개졌다(마이그레이션 128 「알려진 한계」).
      badge({ name: '밤의 보행자(수정)', rarity: 'rare' }),
    ])
    expect(families).toHaveLength(1)
    expect(families[0].key).toBe('walking:밤의 보행자')
    expect(families[0].variants).toHaveLength(2)
  })

  it('이름이 같아도 family_key가 다르면 다른 계열이다', () => {
    const families = groupBadgesIntoFamilies([
      badge({ family_key: 'walking:a' }),
      badge({ family_key: 'walking:b' }),
    ])
    expect(families).toHaveLength(2)
  })

  it('family_key가 비어 있으면 `#name:` 폴백으로 묶인다 — 실제 키와 섞이지 않는다', () => {
    const families = groupBadgesIntoFamilies([
      badge({ family_key: null, rarity: 'common' }),
      badge({ family_key: null, rarity: 'rare' }),
      badge({ family_key: 'walking:밤의 보행자', rarity: 'epic' }),
    ])
    expect(families).toHaveLength(2)
    const fallback = families.find((f) => f.key.startsWith('#name:'))!
    expect(fallback.familyKey).toBeNull()
    expect(fallback.variants).toHaveLength(2)
  })

  it('계열 요약 — 최고 자리·레벨 수·이미지 커버리지·측정 지표', () => {
    const [family] = groupBadgesIntoFamilies([
      leveled(2, { activity_type: 'walking', distance_km: 20 }),
      leveled(1, { activity_type: 'walking', distance_km: 10 }, { image_url: null }),
      leveled(3, { activity_type: 'walking', distance_km: 30 }),
    ])
    expect(family.kind).toBe('leveled')
    expect(family.variants.map((v) => v.level)).toEqual([1, 2, 3])
    expect(family.topLabel).toBe('Lv.3')
    expect(family.variants).toHaveLength(3)
    expect(family.withImage).toBe(2)
    expect(family.measurableKeys).toEqual(['distance_km'])
  })

  it('등급형 계열은 등급 오름차순으로 늘어선다', () => {
    const [family] = groupBadgesIntoFamilies([
      badge({ rarity: 'mystic' }),
      badge({ rarity: 'common' }),
      badge({ rarity: 'epic' }),
      badge({ rarity: 'rare' }),
    ])
    expect(family.variants.map((v) => v.rarity)).toEqual(['common', 'rare', 'epic', 'mystic'])
    expect(family.topLabel).toBe('Mystic')
  })

  it('평가 대기 필드가 있으면 계열 요약에 드러난다', () => {
    const [family] = groupBadgesIntoFamilies([
      badge({ condition_json: { activity_type: 'walking', avg_watts: 200 } }),
    ])
    expect(family.pendingKeys).toContain('avg_watts')
  })
})

describe('② 일괄 재계산은 확인 없이 쓰지 않는다', () => {
  const family = groupBadgesIntoFamilies([
    leveled(1, { activity_type: 'walking', distance_km: 10 }),
    leveled(2, { activity_type: 'walking', distance_km: 20 }),
    leveled(3, { activity_type: 'walking', distance_km: 30 }),
  ])[0]

  it('계획을 세워도 원본 조건은 그대로다 — 계획 단계는 아무것도 쓰지 않는다', () => {
    buildRecalculationPlan(family, { axis: 'distance_km', rule: 'arithmetic', base: 5, amount: 5 })
    expect(family.variants.map((v) => v.condition_json?.distance_km)).toEqual([10, 20, 30])
  })

  it('토큰이 없으면 커밋이 거부된다', () => {
    const plan = buildRecalculationPlan(family, { axis: 'distance_km', rule: 'arithmetic', base: 5, amount: 5 })
    expect(findRecalculationConfirmError(plan, undefined)).toContain('확인')
    expect(findRecalculationConfirmError(plan, '')).toContain('확인')
  })

  it('계획의 토큰이면 통과한다', () => {
    const plan = buildRecalculationPlan(family, { axis: 'distance_km', rule: 'arithmetic', base: 5, amount: 5 })
    expect(plan.changes.map((c) => c.after)).toEqual([5, 10, 15])
    expect(findRecalculationConfirmError(plan, plan.token)).toBeNull()
  })

  it('확인한 뒤 계열이 바뀌면 토큰이 달라져 커밋이 거부된다', () => {
    const spec = { axis: 'distance_km', rule: 'arithmetic', base: 5, amount: 5 } as const
    const seen = buildRecalculationPlan(family, spec)
    // 그 사이 누군가 Lv.2의 값을 고쳤다
    const moved = groupBadgesIntoFamilies([
      leveled(1, { activity_type: 'walking', distance_km: 10 }),
      leveled(2, { activity_type: 'walking', distance_km: 25 }),
      leveled(3, { activity_type: 'walking', distance_km: 30 }),
    ])[0]
    const fresh = buildRecalculationPlan(moved, spec)
    expect(fresh.token).not.toBe(seen.token)
    expect(findRecalculationConfirmError(fresh, seen.token)).toContain('다시 확인')
  })

  it('바뀌는 값이 없으면 커밋할 것도 없다', () => {
    const plan = buildRecalculationPlan(family, {
      axis: 'distance_km',
      rule: 'arithmetic',
      base: 10,
      amount: 10,
    })
    expect(plan.changes.every((c) => !c.changed)).toBe(true)
    expect(findRecalculationConfirmError(plan, plan.token)).toContain('적용할 것이 없습니다')
  })

  it('등비 규칙과 수동 값', () => {
    const geo = buildRecalculationPlan(family, {
      axis: 'distance_km',
      rule: 'geometric',
      base: 10,
      amount: 2,
    })
    expect(geo.changes.map((c) => c.after)).toEqual([10, 20, 40])

    const manual = buildRecalculationPlan(family, {
      axis: 'distance_km',
      rule: 'manual',
      base: 0,
      amount: 0,
      manualValues: [7, null, 99],
    })
    // 빈 칸(null)은 «그대로 둔다»
    expect(manual.changes.map((c) => c.after)).toEqual([7, 20, 99])
  })

  it('작을수록 어려운 축(페이스)은 규칙의 부호가 뒤집힌다', () => {
    const paceFamily = groupBadgesIntoFamilies([
      leveled(1, { activity_type: 'running', max_pace_sec_per_km: 400 }),
      leveled(2, { activity_type: 'running', max_pace_sec_per_km: 380 }),
    ])[0]
    const plan = buildRecalculationPlan(paceFamily, {
      axis: 'max_pace_sec_per_km',
      rule: 'arithmetic',
      base: 400,
      amount: 20,
    })
    expect(plan.changes.map((c) => c.after)).toEqual([400, 380])
  })

  it('축이 없는 배지는 건너뛴다 — 없는 지표를 넣으면 계열 정합성 트리거가 막는다', () => {
    const mixedFamily = groupBadgesIntoFamilies([
      leveled(1, { activity_type: 'walking', distance_km: 10 }),
      leveled(2, { activity_type: 'walking', total_count: 5 }),
    ])[0]
    const plan = buildRecalculationPlan(mixedFamily, {
      axis: 'distance_km',
      rule: 'arithmetic',
      base: 10,
      amount: 10,
    })
    expect(plan.changes).toHaveLength(1)
    expect(plan.skipped.map((s) => s.slotLabel)).toEqual(['Lv.2'])
  })

  it('applyAxisValue는 원본 조건 객체를 건드리지 않는다', () => {
    const original: BadgeCondition = { activity_type: 'walking', distance_km: 10 }
    const next = applyAxisValue(original, 'distance_km', 42)
    expect(original.distance_km).toBe(10)
    expect(next.distance_km).toBe(42)
    expect(next.activity_type).toBe('walking')
  })
})

describe('③ 이미 발급된 family_key는 바꿀 수 없다', () => {
  it('키가 있는 배지에는 다른 키를 발급할 수 없다', () => {
    const error = findFamilyKeyIssueError(
      { name: '밤의 보행자', type: 'activity', family_key: 'walking:밤의 보행자', activity_types: ['walking'] },
      'walking:new-key'
    )
    expect(error).not.toBeNull()
    expect(error).toContain('walking:밤의 보행자')
  })

  it('같은 키를 다시 쓰는 것도 거부한다 — 「발급」과 「변경」을 한 경로에 두지 않는다', () => {
    const error = findFamilyKeyIssueError(
      { name: '밤의 보행자', type: 'activity', family_key: 'walking:같은키', activity_types: ['walking'] },
      'walking:같은키'
    )
    expect(error).not.toBeNull()
  })

  it('키가 비어 있으면 발급할 수 있다', () => {
    expect(
      findFamilyKeyIssueError(
        { name: '밤의 보행자', type: 'activity', family_key: null, activity_types: ['walking'] },
        'walking:night-walker'
      )
    ).toBeNull()
  })

  it('활동 배지가 아니면 발급하지 않는다', () => {
    expect(
      findFamilyKeyIssueError(
        { name: '아이템', type: 'item', family_key: null, activity_types: [] },
        'walking:x'
      )
    ).toContain('활동 배지')
  })

  it('교차 게이트 입력에 적을 수 없는 형태는 거부한다', () => {
    // 조건 폼의 교차 게이트 입력이 쉼표 구분 목록이라 키에 쉼표가 들어가면 손으로 적을 수 없다
    expect(isValidFamilyKey('walking:a,b')).toBe(false)
    expect(isValidFamilyKey('#name:밤의 보행자')).toBe(false)
    expect(isValidFamilyKey('slug-only')).toBe(false)
    expect(isValidFamilyKey(' walking:x')).toBe(false)
    // 130이 구운 기존 형태(공백이 든 한글)는 그대로 유효하다 — 게이트가 이미 가리킬 수 있다
    expect(isValidFamilyKey('walking:밤의 보행자')).toBe(true)
  })

  it('슬러그는 읽을 수 있는 형태로 만든다', () => {
    expect(familyKeySlug('Night Walker')).toBe('night-walker')
    expect(familyKeySlug('  밤의   보행자!  ')).toBe('밤의-보행자')
    expect(buildFamilyKey('walking', 'Night Walker')).toBe('walking:night-walker')
  })

  it('형제가 이미 키를 갖고 있으면 그 키를 그대로 쓴다 — 계열을 둘로 쪼개지 않는다', () => {
    const [family] = groupBadgesIntoFamilies([
      badge({ family_key: 'walking:밤의 보행자', rarity: 'common' }),
    ])
    expect(proposeFamilyKey(family)).toBe('walking:밤의 보행자')
  })

  it('키가 아무도 없으면 종목·이름에서 새로 만든다', () => {
    const [family] = groupBadgesIntoFamilies([badge({ family_key: null, name: 'Night Walker' })])
    expect(proposeFamilyKey(family)).toBe('walking:night-walker')
  })
})

describe('④ 레벨 생성이 조건 축·이미지를 상속한다', () => {
  const family = groupBadgesIntoFamilies([
    leveled(1, {
      activity_type: 'walking',
      distance_km: 10,
      total_count: 5,
      time_range: { start: '22:00', end: '05:00' },
    }),
    leveled(2, {
      activity_type: 'walking',
      distance_km: 20,
      total_count: 10,
      time_range: { start: '22:00', end: '05:00' },
    }),
  ])[0]

  it('다음 자리는 Lv.3이다', () => {
    expect(nextFamilySlot(family)).toMatchObject({ kind: 'level', level: 3, label: 'Lv.3' })
  })

  it('조건 축·필터·이미지·계열 키·표시 순서를 상속한다', () => {
    const draft = buildNextLevelDraft(family, { rule: 'arithmetic' })!
    expect(numericAxisKeysOf(draft.condition_json).sort()).toEqual(['distance_km', 'total_count'])
    // 수치가 아닌 필터도 그대로 물려받는다 — 빠뜨리면 다음 레벨이 다른 조건의 배지가 된다
    expect(draft.condition_json.activity_type).toBe('walking')
    expect(draft.condition_json.time_range).toEqual({ start: '22:00', end: '05:00' })
    expect(draft.image_url).toBe('https://cdn.example.com/night.png')
    expect(draft.family_key).toBe('walking:night-walker')
    expect(draft.sort_order).toBe(5)
    expect(draft.level).toBe(3)
    expect(draft.rarity).toBeNull()
  })

  it('증가 폭을 넘기지 않으면 직전 두 레벨에서 유추한다 (등차)', () => {
    const draft = buildNextLevelDraft(family, { rule: 'arithmetic' })!
    expect(draft.inferred).toBe(true)
    expect(draft.condition_json.distance_km).toBe(30)
    expect(draft.condition_json.total_count).toBe(15)
  })

  it('등비 규칙 · 명시한 증가 폭이 유추보다 우선한다', () => {
    expect(buildNextLevelDraft(family, { rule: 'geometric' })!.condition_json.distance_km).toBe(40)
    expect(buildNextLevelDraft(family, { rule: 'arithmetic', amount: 5 })!.condition_json.distance_km).toBe(25)
    expect(buildNextLevelDraft(family, { rule: 'geometric', amount: 3 })!.condition_json.distance_km).toBe(60)
  })

  it('수동 규칙은 직전 값을 그대로 둔다 — 화면에서 고쳐 넣는다', () => {
    const draft = buildNextLevelDraft(family, { rule: 'manual' })!
    expect(draft.condition_json.distance_km).toBe(20)
    expect(draft.axes.map((a) => [a.before, a.after])).toEqual([
      [20, 20],
      [10, 10],
    ])
  })

  it('원본 배지의 조건은 초안을 만들어도 그대로다', () => {
    buildNextLevelDraft(family, { rule: 'arithmetic', amount: 100 })
    expect(family.variants[1].condition_json?.distance_km).toBe(20)
  })

  it('등급형 계열은 다음 등급을 만든다 — Mystic까지 차 있으면 만들 수 없다', () => {
    const graded = groupBadgesIntoFamilies([badge({ rarity: 'common' }), badge({ rarity: 'rare' })])[0]
    const draft = buildNextLevelDraft(graded, { rule: 'manual' })!
    expect(draft.rarity).toBe('epic')
    expect(draft.level).toBeNull()

    const full = groupBadgesIntoFamilies([
      badge({ rarity: 'common' }),
      badge({ rarity: 'rare' }),
      badge({ rarity: 'epic' }),
      badge({ rarity: 'mystic' }),
    ])[0]
    expect(nextFamilySlot(full)).toBeNull()
    expect(buildNextLevelDraft(full, { rule: 'manual' })).toBeNull()
  })

  it('등급형·레벨형이 한 키에 섞이면(mixed) 다음 자리를 판단하지 않는다', () => {
    const mixed = groupBadgesIntoFamilies([
      badge({ rarity: 'common', family_key: 'walking:mixed' }),
      badge({ rarity: null, level: 1, family_key: 'walking:mixed' }),
    ])[0]
    expect(mixed.kind).toBe('mixed')
    expect(nextFamilySlot(mixed)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 게이트 WARN 반영 — 「자리 추가」의 증가 방향이 뒤집히지 않는다
// ─────────────────────────────────────────────────────────────────────────

/** 지정한 등급들만 가진 등급형 계열 하나 */
function gradedFamily(rarities: readonly BadgeRarity[]) {
  return groupBadgesIntoFamilies(rarities.map((r) => badge({ rarity: r })))[0]
}

describe('nextFamilySlot — 상속 방향과 제안 방향이 일치한다', () => {
  // 초안은 「빈 자리 중 가장 낮은 등급」을 제안했는데 조건 축은 「가장 높은 자리」에서
  // 상속하고 증가를 위 방향으로 적용해, Mystic 하나뿐인 계열에서 Mystic보다 임계값이 더 큰
  // Common 초안이 나왔다. 실측 87계열 중 36계열(41%)이 이 형태다.
  it('Mystic 하나뿐인 계열은 더 얹을 자리가 없다 — Common을 제안하지 않는다', () => {
    const family = gradedFamily(['mystic'])
    expect(nextFamilySlot(family)).toBeNull()
  })

  it('Common 하나뿐이면 Rare를 제안한다 (위 방향)', () => {
    expect(nextFamilySlot(gradedFamily(['common']))?.rarity).toBe('rare')
  })

  it('중간이 빈 계열도 최고 자리의 바로 위를 제안한다 — 구멍을 메우지 않는다', () => {
    // Rare·Epic만 있는 계열: Common(구멍)이 아니라 Mystic을 제안한다.
    // 구멍 메우기는 상속 없이 임의 등급을 만드는 일이라 기존 배지 폼의 몫이다.
    expect(nextFamilySlot(gradedFamily(['rare', 'epic']))?.rarity).toBe('mystic')
  })

  it('초안이 상속원보다 낮은 자리를 제안하는 일이 없다', () => {
    // 방향 뒤집힘의 근본 조건 — 제안 자리의 서열이 상속원보다 항상 높아야 한다.
    const RANK = { common: 0, rare: 1, epic: 2, mystic: 3 } as const
    for (const owned of [['common'], ['rare'], ['epic'], ['common', 'rare'], ['rare', 'epic']] as const) {
      const family = gradedFamily([...owned])
      const slot = nextFamilySlot(family)
      if (!slot?.rarity) continue
      const highest = family.variants[family.variants.length - 1].rarity!
      expect(RANK[slot.rarity]).toBeGreaterThan(RANK[highest])
    }
  })
})
