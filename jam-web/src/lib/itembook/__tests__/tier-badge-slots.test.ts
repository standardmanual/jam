/**
 * 컬렉션 상세 화면의 칸 만들기 사례표 (티켓 20261028_1408)
 *
 * 컬렉션 등급(`tier`)은 `computeBookCompletion`의 실제 결과를 쓴다 — 화면(`page.tsx`)과 같은 경로다.
 * 소프트 삭제 배지는 `computeBookCompletion`에는 넘기고 칸 입력(`badges`)에서는 뺀다(`page.tsx`와 같다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/itembook/__tests__/tier-badge-slots.test.ts
 */
import { describe, expect, it } from 'vitest'
import { computeBookCompletion, type CompletionBadgeInput } from '../completion-basis'
import {
  buildBadgeSlots,
  shouldOpenCandidateSheet,
  type BadgeSlotCandidate,
  type BadgeSlotRecord,
  type BadgeSlotsBadge,
} from '../tier-badge-slots'

const BOOK = 'book-1'
const RARITIES = ['common', 'rare', 'epic', 'mystic'] as const
const NAMES = Array.from({ length: 9 }, (_, i) => `이름${i + 1}`)

type TestBadge = CompletionBadgeInput & BadgeSlotsBadge

function badge(name: string, rarity: string | null, extra: Partial<TestBadge> = {}): TestBadge {
  const id = `${name}-${rarity}`
  return {
    id,
    item_book_id: BOOK,
    type: 'item',
    drop_excluded: false,
    name,
    rarity,
    image_url: `img/${id}`,
    deleted_at: null,
    ...extra,
  }
}

/** 이름 9종 × 4등급, 이름 묶음이 먼저 나오는 순서(created_at 오름차순)로 늘어놓는다 */
function fullBook(): TestBadge[] {
  return NAMES.flatMap((name) => RARITIES.map((rarity) => badge(name, rarity)))
}

function candidate(badgeId: string, serial: number): BadgeSlotCandidate {
  return { id: `${badgeId}#${serial}`, serial_number: serial, serial_prefix: 'AAAA', expires_at: null }
}

interface RunOptions {
  badges: TestBadge[]
  /** 가진(미장착) 개체: 배지 id → 일련번호 목록 */
  owned?: Record<string, number[]>
  /** 장착한 배지 id */
  slotted?: string[]
  tierMode?: boolean
}

function run({ badges, owned = {}, slotted = [], tierMode = true }: RunOptions) {
  const candidatesByBadge = new Map(
    Object.entries(owned).map(([id, serials]) => [id, serials.map((n) => candidate(id, n))])
  )
  const slotByBadge = new Map<string, BadgeSlotRecord>(
    slotted.map((id) => [id, { id: `slot-${id}`, slotted_at: '2026-10-28T00:00:00Z', inventory_item_id: `inv-${id}` }])
  )
  const completion = computeBookCompletion(badges, new Set<string>(), {
    filledByBook: new Map([[BOOK, new Set(slotted)]]),
    tierModeBookIds: tierMode ? new Set([BOOK]) : undefined,
  }).get(BOOK)
  const slots = buildBadgeSlots({
    badges: badges.filter((b) => !b.deleted_at),
    candidatesByBadge,
    slotByBadge,
    tierMode,
    completion,
  })
  return { slots, completion }
}

describe('buildBadgeSlots — tier_mode가 꺼진 컬렉션', () => {
  it('소속 아이템 배지 전부를 1:1로 칸에 두고 cellKey를 달지 않는다(이전 모양 그대로)', () => {
    const badges = [badge('A', 'common'), badge('B', 'rare'), badge('C', null)]
    const { slots } = run({
      badges,
      tierMode: false,
      owned: { 'A-common': [1, 2] },
      slotted: ['B-rare'],
    })

    expect(slots.map((s) => s.badge.id)).toEqual(['A-common', 'B-rare', 'C-null'])
    expect(slots.every((s) => !('cellKey' in s))).toBe(true)
    expect(slots[0].candidates.map((c) => c.id)).toEqual(['A-common#1', 'A-common#2'])
    expect(slots[0].candidates.every((c) => !('rarity' in c))).toBe(true)
    expect(slots[1].slot?.id).toBe('slot-B-rare')
    expect(slots[2].candidates).toEqual([])
  })

  it('같은 이름의 등급별 배지도 묶지 않는다', () => {
    const { slots } = run({ badges: fullBook(), tierMode: false })
    expect(slots).toHaveLength(36)
  })
})

describe('buildBadgeSlots — 컬렉션 등급이 정해진 경우', () => {
  it('Rare를 장착했으면 Rare 배지 9칸만 나오고 칸 수는 진행도 분모와 같다', () => {
    const { slots, completion } = run({
      badges: fullBook(),
      slotted: ['이름1-rare'],
      owned: { '이름2-rare': [7], '이름3-epic': [8], '이름4-common': [9] },
    })

    expect(completion?.tier).toBe('rare')
    expect(slots).toHaveLength(9)
    expect(slots).toHaveLength(completion?.total ?? -1)
    expect(slots.every((s) => s.badge.rarity === 'rare')).toBe(true)
    expect(slots.map((s) => s.cellKey)).toEqual(NAMES)
    expect(slots[0].slot?.inventory_item_id).toBe('inv-이름1-rare')
  })

  it('고정 등급의 후보만 남기고 다른 등급만 가진 이름은 후보가 없는 칸이 된다', () => {
    const { slots } = run({
      badges: fullBook(),
      slotted: ['이름1-rare'],
      owned: { '이름2-rare': [7], '이름3-epic': [8], '이름4-common': [9] },
    })

    expect(slots[1].candidates.map((c) => c.id)).toEqual(['이름2-rare#7'])
    // 이름3은 Epic만, 이름4는 Common만 가졌다 — Rare 칸에는 후보가 없어 «???»가 된다
    expect(slots[2].candidates).toEqual([])
    expect(slots[3].candidates).toEqual([])
    // 등급이 정해진 뒤의 후보는 개체별 등급을 달지 않는다(시트의 rarity prop이 칩을 그린다)
    expect(slots[1].candidates.every((c) => !('rarity' in c))).toBe(true)
  })

  it('Common을 고정한 경우도 Common 배지 9칸이다', () => {
    const { slots, completion } = run({ badges: fullBook(), slotted: ['이름5-common'] })

    expect(completion?.tier).toBe('common')
    expect(slots).toHaveLength(9)
    expect(slots.every((s) => s.badge.rarity === 'common')).toBe(true)
  })

  it('드랍 제외 배지도 칸에는 넣는다(가진 것을 가리지 않는다)', () => {
    const badges = fullBook().map((b) => (b.id === '이름9-rare' ? { ...b, drop_excluded: true } : b))
    const { slots, completion } = run({ badges, slotted: ['이름1-rare'], owned: { '이름9-rare': [1] } })

    expect(slots).toHaveLength(9)
    expect(slots[8].badge.id).toBe('이름9-rare')
    expect(slots[8].candidates).toHaveLength(1)
    // 분모는 드랍 제외를 빼 8이다 — 칸 수와 어긋나는 사례(지금 꺼진 컬렉션도 같은 동작이다)
    expect(completion?.total).toBe(8)
  })

  it('칸 순서는 등급이 달라져도 이름 묶음이 처음 나온 순서 그대로다', () => {
    const rare = run({ badges: fullBook(), slotted: ['이름1-rare'] }).slots.map((s) => s.cellKey)
    const mystic = run({ badges: fullBook(), slotted: ['이름1-mystic'] }).slots.map((s) => s.cellKey)
    const none = run({ badges: fullBook() }).slots.map((s) => s.cellKey)

    expect(rare).toEqual(NAMES)
    expect(mystic).toEqual(NAMES)
    expect(none).toEqual(NAMES)
  })

  it('등급이 바뀌면 같은 cellKey의 대표 배지 id가 달라진다(시트·진행 표시는 cellKey로 찾는다)', () => {
    const rare = run({ badges: fullBook(), slotted: ['이름1-rare'] }).slots[0]
    const epic = run({ badges: fullBook(), slotted: ['이름1-epic'] }).slots[0]

    expect(rare.cellKey).toBe(epic.cellKey)
    expect(rare.badge.id).toBe('이름1-rare')
    expect(epic.badge.id).toBe('이름1-epic')
  })
})

describe('buildBadgeSlots — 컬렉션 등급이 없는 경우(아무것도 장착하지 않음)', () => {
  it('칸이 36개가 아니라 진행도 분모와 같은 이름 수(9)로 나온다', () => {
    const { slots, completion } = run({ badges: fullBook() })

    expect(completion?.tier).toBeNull()
    expect(slots).toHaveLength(9)
    expect(slots).toHaveLength(completion?.total ?? -1)
    expect(slots.map((s) => s.cellKey)).toEqual(NAMES)
    expect(slots.every((s) => s.slot === null)).toBe(true)
  })

  it('이름 묶음의 모든 등급 후보를 낮은 등급 순으로 합치고 후보마다 등급을 단다', () => {
    const { slots } = run({
      badges: fullBook(),
      owned: { '이름1-epic': [30], '이름1-common': [10, 11], '이름1-rare': [20] },
    })

    expect(slots[0].candidates.map((c) => [c.rarity, c.serial_number])).toEqual([
      ['common', 10],
      ['common', 11],
      ['rare', 20],
      ['epic', 30],
    ])
  })

  it('가진 배지가 있으면 그중 가장 낮은 등급 배지가 칸의 대표다', () => {
    const { slots } = run({
      badges: fullBook(),
      owned: { '이름1-epic': [30], '이름1-rare': [20], '이름2-mystic': [1] },
    })

    expect(slots[0].badge.id).toBe('이름1-rare')
    expect(slots[1].badge.id).toBe('이름2-mystic')
  })

  it('하나도 못 가진 이름은 그 이름의 가장 낮은 등급 배지에 후보 없는 칸이다', () => {
    const { slots } = run({ badges: fullBook(), owned: { '이름1-rare': [20] } })

    expect(slots[2].badge.id).toBe('이름3-common')
    expect(slots[2].candidates).toEqual([])
  })

  it('장착 모두 해제: 장착했던 때와 같은 자리에 등급 없는 칸으로 돌아온다', () => {
    const owned = { '이름1-rare': [20], '이름2-rare': [21] }
    const fixed = run({ badges: fullBook(), slotted: ['이름1-rare'], owned: { '이름2-rare': [21] } })
    const released = run({ badges: fullBook(), owned })

    expect(fixed.completion?.tier).toBe('rare')
    expect(released.completion?.tier).toBeNull()
    expect(released.slots.map((s) => s.cellKey)).toEqual(fixed.slots.map((s) => s.cellKey))
    expect(released.slots).toHaveLength(9)
    expect(released.slots.every((s) => s.slot === null)).toBe(true)
  })

  it('등급이 비어 있는 배지는 칸에서 뺀다(분모 규칙과 같다)', () => {
    const badges = [...fullBook(), badge('무등급', null)]
    const { slots, completion } = run({ badges })

    expect(slots).toHaveLength(9)
    expect(slots.some((s) => s.cellKey === '무등급')).toBe(false)
    expect(completion?.total).toBe(9)
  })
})

describe('buildBadgeSlots — 이름 수가 등급마다 다른 컬렉션(컨텐츠 입력 규칙 위반, 숨기지 않는다)', () => {
  // Epic에는 이름9가 없다 — 진행도 분모(첫 등급 Common 기준)는 9, Epic 고정 칸은 8
  const badges = fullBook().filter((b) => b.id !== '이름9-epic')

  it('고정 등급에 없는 이름은 칸이 없다', () => {
    const { slots, completion } = run({ badges, slotted: ['이름1-epic'] })

    expect(slots).toHaveLength(8)
    expect(completion?.total).toBe(8)
  })

  it('등급 없는 칸은 모든 이름을 합쳐 9칸이다', () => {
    const { slots, completion } = run({ badges })

    expect(slots).toHaveLength(9)
    expect(completion?.total).toBe(9)
  })
})

describe('buildBadgeSlots — 소프트 삭제 배지에 꽂힌 슬롯', () => {
  it('삭제된 Rare 배지에 꽂혀 있으면 컬렉션 등급은 Rare이고 살아 있는 Rare 9칸을 그린다', () => {
    const deleted = badge('삭제된배지', 'rare', { deleted_at: '2026-10-01T00:00:00Z' })
    const { slots, completion } = run({
      badges: [deleted, ...fullBook()],
      slotted: [deleted.id],
      owned: { '이름1-rare': [1], '이름2-epic': [2] },
    })

    expect(completion?.tier).toBe('rare')
    expect(slots).toHaveLength(9)
    expect(slots.every((s) => s.badge.rarity === 'rare')).toBe(true)
    expect(slots.some((s) => s.cellKey === '삭제된배지')).toBe(false)
    expect(slots[0].candidates).toHaveLength(1)
    expect(slots[1].candidates).toEqual([])
  })

  it('삭제 배지가 정한 등급에 살아 있는 배지가 없으면 진행도 기준 등급으로 그리고 후보를 비운다', () => {
    const deleted = badge('삭제된배지', 'epic', { deleted_at: '2026-10-01T00:00:00Z' })
    const live = fullBook().filter((b) => b.rarity !== 'epic')
    const { slots, completion } = run({
      badges: [deleted, ...live],
      slotted: [deleted.id],
      owned: { '이름1-common': [1], '이름2-rare': [2] },
    })

    expect(completion?.tier).toBe('epic')
    expect(completion?.tiers.epic).toBeUndefined()
    // 진행도의 기준 등급은 첫 등급(Common)이다
    expect(slots).toHaveLength(9)
    expect(slots.every((s) => s.badge.rarity === 'common')).toBe(true)
    // 서버가 tier_mismatch로 거절할 길이라 «추가»가 나오지 않도록 후보가 모두 비어 있다
    expect(slots.every((s) => s.candidates.length === 0)).toBe(true)
  })
})

describe('buildBadgeSlots — 입력이 비어 있는 경우', () => {
  it('아이템 배지가 없으면 칸이 없다', () => {
    const { slots } = run({ badges: [] })
    expect(slots).toEqual([])
  })
})

describe('shouldOpenCandidateSheet — «추가» 버튼', () => {
  it('컬렉션 등급이 없으면 후보가 1개여도 시트를 연다', () => {
    expect(shouldOpenCandidateSheet(1, true)).toBe(true)
    expect(shouldOpenCandidateSheet(3, true)).toBe(true)
  })

  it('컬렉션 등급이 정해졌으면 후보 1개는 바로 장착하고 2개 이상은 시트를 연다', () => {
    expect(shouldOpenCandidateSheet(1, false)).toBe(false)
    expect(shouldOpenCandidateSheet(2, false)).toBe(true)
  })
})
