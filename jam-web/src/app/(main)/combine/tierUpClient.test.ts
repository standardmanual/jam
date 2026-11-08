/**
 * 등급 올리기 화면의 순수 도우미 (티켓 20261022_2119 3회) — 재료 묶기, 담은 칸 갱신, 시트 모양, 결과 문구, 소각 전 거절 문구.
 */
import { describe, it, expect } from 'vitest'
import {
  TIER_UP_MATERIAL_COUNT,
  TIER_UP_MATERIAL_RARITIES,
  buildTierUpSheet,
  emptyTierUpSlots,
  fillTierUpSlot,
  groupTierUpMaterials,
  hasEnoughTierUpGroup,
  lockedTierUpRarity,
  nextEmptyTierUpSlot,
  pickableTierUpIds,
  removeTierUpSlot,
  resolveTierUpSlots,
  tierUpRarityNote,
  tierUpRejection,
  tierUpResultMessage,
  tierUpSubmitIds,
  type TierUpMaterial,
  type TierUpRequest,
} from './tierUpClient'
import { d } from '@/lib/i18n'
import { USER_SUSPENDED_CODE } from '@/lib/suspension/suspension-contract'

function material(id: string, rarity: string | null): TierUpMaterial {
  return { id, badge: { name: `배지 ${id}`, image_url: null, rarity } }
}

function many(prefix: string, rarity: string | null, count: number): TierUpMaterial[] {
  return Array.from({ length: count }, (_, i) => material(`${prefix}${i + 1}`, rarity))
}

describe('재료 규칙', () => {
  it('재료는 6개이고 Mystic도 재료 등급이다 (낮은 순)', () => {
    expect(TIER_UP_MATERIAL_COUNT).toBe(6)
    expect(TIER_UP_MATERIAL_RARITIES).toEqual(['common', 'rare', 'epic', 'mystic'])
  })

  it('요청 본문에는 컬렉션 id 칸이 없다', () => {
    const request: TierUpRequest = { itemIds: ['a'] }
    expect(Object.keys(request)).toEqual(['itemIds'])
  })
})

describe('groupTierUpMaterials', () => {
  it('Common, Rare, Epic, Mystic 순으로 묶고 등급 없는 개체는 뺀다', () => {
    const items = [
      material('e1', 'epic'),
      material('m1', 'mystic'),
      material('c1', 'common'),
      material('n1', null),
      material('r1', 'rare'),
      material('c2', 'common'),
    ]
    const groups = groupTierUpMaterials(items)
    expect(groups.map((g) => g.rarity)).toEqual(['common', 'rare', 'epic', 'mystic'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['c1', 'c2'])
    expect(groups[3].items.map((i) => i.id)).toEqual(['m1'])
    expect(groups.flatMap((g) => g.items.map((i) => i.id))).not.toContain('n1')
  })

  it('개체가 없는 등급은 묶음을 만들지 않는다', () => {
    expect(groupTierUpMaterials(many('r', 'rare', 2)).map((g) => g.rarity)).toEqual(['rare'])
    expect(groupTierUpMaterials([material('m', 'mystic')]).map((g) => g.rarity)).toEqual(['mystic'])
    expect(groupTierUpMaterials([material('n', null)])).toEqual([])
    expect(groupTierUpMaterials([])).toEqual([])
  })
})

describe('hasEnoughTierUpGroup', () => {
  it('6개 이상 가진 등급이 하나라도 있으면 참이다', () => {
    expect(hasEnoughTierUpGroup(groupTierUpMaterials([...many('c', 'common', 5), ...many('r', 'rare', 6)]))).toBe(true)
    expect(hasEnoughTierUpGroup(groupTierUpMaterials(many('m', 'mystic', 6)))).toBe(true)
  })

  it('모든 등급이 6개 미만이면 거짓이다', () => {
    expect(hasEnoughTierUpGroup(groupTierUpMaterials([...many('c', 'common', 5), ...many('r', 'rare', 3)]))).toBe(false)
    expect(hasEnoughTierUpGroup([])).toBe(false)
  })
})

describe('담은 칸', () => {
  it('빈 칸 6개로 시작한다', () => {
    expect(emptyTierUpSlots()).toEqual([null, null, null, null, null, null])
    expect(emptyTierUpSlots()).toHaveLength(TIER_UP_MATERIAL_COUNT)
  })

  it('fillTierUpSlot: 지정한 칸에 담고, 같은 개체가 다른 칸에 있으면 그쪽에서 뺀다', () => {
    const once = fillTierUpSlot(emptyTierUpSlots(), 1, 'a')
    expect(once).toEqual([null, 'a', null, null, null, null])
    expect(fillTierUpSlot(once, 3, 'a')).toEqual([null, null, null, 'a', null, null])
  })

  it('removeTierUpSlot: 그 칸만 비운다', () => {
    expect(removeTierUpSlot(['a', 'b', null, null, null, null], 0)).toEqual([null, 'b', null, null, null, null])
  })

  it('nextEmptyTierUpSlot: from 칸부터 한 바퀴 돌며 처음 만나는 빈 칸, 모두 차면 null', () => {
    expect(nextEmptyTierUpSlot(['a', null, 'c', null, null, null], 2)).toBe(3)
    expect(nextEmptyTierUpSlot(['a', null, 'c', 'd', 'e', 'f'], 2)).toBe(1)
    expect(nextEmptyTierUpSlot(['a', 'b', 'c', 'd', 'e', 'f'], 0)).toBeNull()
    // 마지막 칸 다음은 처음으로 돌아온다
    expect(nextEmptyTierUpSlot([null, 'b', 'c', 'd', 'e', 'f'], 6)).toBe(0)
  })

  it('resolveTierUpSlots: 목록에서 찾을 수 없는 개체는 빈 칸으로 본다(유령 칸 없음)', () => {
    const items = many('r', 'rare', 3)
    const resolved = resolveTierUpSlots(['r1', 'gone', 'r3', null, null, null], items)
    expect(resolved.map((item) => item?.id ?? null)).toEqual(['r1', null, 'r3', null, null, null])
  })
})

describe('lockedTierUpRarity / tierUpSubmitIds', () => {
  it('lockedTierUpRarity: 첫 재료의 등급으로 고정된다. 하나도 없으면 null', () => {
    expect(lockedTierUpRarity([null, null, null, null, null, null])).toBeNull()
    expect(lockedTierUpRarity([null, material('r1', 'rare'), null, null, null, null])).toBe('rare')
    expect(lockedTierUpRarity([material('m1', 'mystic'), null, null, null, null, null])).toBe('mystic')
  })

  it('tierUpSubmitIds: 같은 등급 6개가 서로 다른 개체로 찼을 때만 id를 칸 순서로 돌려준다', () => {
    const six = many('e', 'epic', 6)
    expect(tierUpSubmitIds(six)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'])
    expect(tierUpSubmitIds(six.slice(0, 5))).toBeNull()
    expect(tierUpSubmitIds([...six.slice(0, 5), null])).toBeNull()
  })

  it('Mystic 6개도 제출할 수 있다', () => {
    expect(tierUpSubmitIds(many('m', 'mystic', 6))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
  })

  it('다른 등급이 섞이거나 등급 없음이 들어 있거나 같은 개체가 겹치면 제출할 수 없다', () => {
    const five = many('r', 'rare', 5)
    expect(tierUpSubmitIds([...five, material('c1', 'common')])).toBeNull()
    expect(tierUpSubmitIds([...many('m', 'mystic', 5), material('e1', 'epic')])).toBeNull()
    expect(tierUpSubmitIds(many('n', null, 6))).toBeNull()
    expect(tierUpSubmitIds([...five, five[0]])).toBeNull()
  })
})

describe('buildTierUpSheet', () => {
  const rare7 = many('r', 'rare', 7)
  const common3 = many('c', 'common', 3)
  const mystic6 = many('m', 'mystic', 6)
  const groups = groupTierUpMaterials([...common3, ...rare7, ...mystic6])

  it('넣을 수 있는 배지가 하나도 없으면 empty', () => {
    expect(buildTierUpSheet([], [null, null, null, null, null, null])).toEqual({ kind: 'empty' })
  })

  it('아직 아무것도 담지 않았으면 등급 묶음이고, 6개 미만 묶음은 셀이 모두 비활성이다', () => {
    const view = buildTierUpSheet(groups, [null, null, null, null, null, null])
    expect(view.kind).toBe('groups')
    if (view.kind !== 'groups') return
    expect(view.groups.map((g) => [g.rarity, g.count, g.enough])).toEqual([
      ['common', 3, false],
      ['rare', 7, true],
      ['mystic', 6, true],
    ])
    expect(view.groups[0].cells.every((cell) => cell.state === 'inactive')).toBe(true)
    expect(view.groups[1].cells.every((cell) => cell.state === 'active')).toBe(true)
    expect(view.groups[2].cells.every((cell) => cell.state === 'active')).toBe(true)
  })

  it('첫 재료를 담은 뒤에는 그 등급의 셀만 한 묶음으로 보이고, 담은 셀은 사용 중이다', () => {
    const view = buildTierUpSheet(groups, [rare7[0], rare7[1], null, null, null, null])
    expect(view.kind).toBe('locked')
    if (view.kind !== 'locked') return
    expect(view.rarity).toBe('rare')
    expect(view.cells).toHaveLength(7)
    expect(view.cells.filter((cell) => cell.state === 'used').map((cell) => cell.item.id)).toEqual(['r1', 'r2'])
    expect(view.cells.filter((cell) => cell.state === 'active')).toHaveLength(5)
  })

  it('Mystic을 첫 재료로 담으면 Mystic만 활성이고 나머지 등급은 시트에 보이지 않는다', () => {
    const view = buildTierUpSheet(groups, [mystic6[0], null, null, null, null, null])
    expect(view.kind).toBe('locked')
    if (view.kind !== 'locked') return
    expect(view.rarity).toBe('mystic')
    expect(view.cells.map((cell) => cell.item.id)).toEqual(mystic6.map((item) => item.id))
    expect(pickableTierUpIds(view).has('m2')).toBe(true)
    expect(pickableTierUpIds(view).has('r1')).toBe(false)
  })

  it('pickableTierUpIds: 활성 셀의 개체만 담을 수 있다 — 6개 미만 묶음·다른 등급·사용 중은 담을 수 없다', () => {
    const grouped = pickableTierUpIds(buildTierUpSheet(groups, [null, null, null, null, null, null]))
    expect([...grouped].sort()).toEqual([...rare7, ...mystic6].map((i) => i.id).sort())
    expect(grouped.has('c1')).toBe(false)

    const locked = pickableTierUpIds(buildTierUpSheet(groups, [rare7[0], null, null, null, null, null]))
    expect(locked.has('r1')).toBe(false)
    expect(locked.has('r2')).toBe(true)
    expect(locked.has('c1')).toBe(false)
    expect(locked.has('m1')).toBe(false)

    expect(pickableTierUpIds({ kind: 'empty' }).size).toBe(0)
  })
})

describe('tierUpRarityNote / tierUpResultMessage', () => {
  it('등급 안내는 등급 글자로 전한다', () => {
    expect(tierUpRarityNote('rare')).toBe('지금은 Rare 아이템 배지만 넣을 수 있어요')
    expect(tierUpRarityNote('mystic')).toBe('지금은 Mystic 아이템 배지만 넣을 수 있어요')
  })

  it('윗등급이 나오면 그 사실만 말한다', () => {
    expect(tierUpResultMessage('rare', [{ rarity: 'epic' }])).toBe('윗등급이 나왔어요! Epic 아이템 배지를 받았어요')
    expect(tierUpResultMessage('epic', [{ rarity: 'mystic' }])).toBe('윗등급이 나왔어요! Mystic 아이템 배지를 받았어요')
  })

  it('같은 등급이면 받은 등급만 말하고 뒤에 설명을 덧붙이지 않는다', () => {
    expect(tierUpResultMessage('rare', [{ rarity: 'rare' }])).toBe('Rare 아이템 배지를 받았어요')
    expect(tierUpResultMessage('common', [{ rarity: 'common' }])).toBe(
      'Common 아이템 배지를 받았어요',
    )
  })

  it('Mystic 재료는 Mystic 결과가 같은 등급이라 «윗등급»을 말하지 않는다', () => {
    const message = tierUpResultMessage('mystic', [{ rarity: 'mystic' }])
    expect(message).toBe('Mystic 아이템 배지를 받았어요')
    expect(message).not.toContain('윗등급')
  })

  it('응답에 등급이 없거나 비교할 수 없으면 등급을 지어내지 않는다', () => {
    const unknown = '아이템 배지를 받았어요'
    expect(tierUpResultMessage('rare', [{}])).toBe(unknown)
    expect(tierUpResultMessage('rare', [{ rarity: null }])).toBe(unknown)
    expect(tierUpResultMessage(undefined, [{ rarity: 'epic' }])).toBe(unknown)
    expect(tierUpResultMessage('rare', [])).toBe(unknown)
    // 재료보다 낮은 등급은 나올 수 없다 — 나오더라도 «윗등급»이라 말하지 않는다
    expect(tierUpResultMessage('epic', [{ rarity: 'rare' }])).toBe(unknown)
  })

  it('어느 갈래의 문구에도 확률 숫자와 퍼센트, 항상 올라간다는 말이 없다', () => {
    const all = [
      tierUpResultMessage('rare', [{ rarity: 'epic' }]),
      tierUpResultMessage('rare', [{ rarity: 'rare' }]),
      tierUpResultMessage('rare', [{}]),
      d.combine.tierUp.description,
      d.combine.tierUp.entrySubtitle,
    ].join('\n')
    expect(all).not.toMatch(/%|퍼센트/)
    expect(all).not.toContain('등급이 올랐어요')
  })
})

describe('tierUpRejection — 소각 전 거절', () => {
  it('no_candidate·invalid_materials·invalid_count는 서버 문구가 없으면 확정 문구를 쓰고 «넣은 재료는 그대로 있어요»를 말한다', () => {
    for (const reason of ['no_candidate', 'invalid_materials', 'invalid_count'] as const) {
      const rejection = tierUpRejection(200, { success: false, reason })
      expect(rejection.tone).toBe('info')
      expect(rejection.message).toContain('넣은 재료는 그대로 있어요')
      expect(rejection.clearSlots).toBe(false)
    }
    expect(tierUpRejection(200, { success: false, reason: 'no_candidate' }).message).toBe(
      '지금은 받을 수 있는 아이템 배지가 없어요. 넣은 재료는 그대로 있어요. 잠시 뒤에 다시 해 보세요.',
    )
  })

  it('서버가 message를 주면 그것을 먼저 쓴다', () => {
    expect(tierUpRejection(200, { success: false, reason: 'no_candidate', message: '서버 문구' }).message).toBe('서버 문구')
  })

  it('no_candidate는 안내(info)이고 담은 칸을 그대로 둔다 - 컬렉션을 푸는 후속 동작이 없다', () => {
    const rejection = tierUpRejection(200, { success: false, reason: 'no_candidate' })
    expect(rejection).toEqual({
      tone: 'info',
      clearSlots: false,
      refreshPending: false,
      refresh: false,
      message: d.combine.tierUp.noCandidate,
    })
    expect(rejection).not.toHaveProperty('clearCollection')
  })

  it('items_not_found는 칸을 비우고 목록을 새로 받는다', () => {
    const rejection = tierUpRejection(200, { success: false, reason: 'items_not_found' })
    expect(rejection).toMatchObject({ message: d.combine.itemsNotFound, tone: 'info', clearSlots: true, refresh: true })
  })

  it('locked_item_not_allowed(409)는 잠긴 개체 안내를 안내(info)로 낸다', () => {
    const rejection = tierUpRejection(409, { success: false, reason: 'locked_item_not_allowed', code: 'locked_item_not_allowed' })
    expect(rejection).toMatchObject({ message: d.lockedItem.combine, tone: 'info', clearSlots: false })
  })

  it('pending_results_exist(409)는 안내(info)이고 배너 개수를 다시 읽는다', () => {
    const rejection = tierUpRejection(409, { success: false, reason: 'pending_results_exist', code: 'pending_results_exist' })
    expect(rejection).toMatchObject({ message: d.combine.pendingResultsExist, tone: 'info', refreshPending: true, clearSlots: false })
  })

  it('이용 정지(403)는 안내(info)다', () => {
    expect(tierUpRejection(403, { error: '정지 문구', code: USER_SUSPENDED_CODE })).toMatchObject({
      message: '정지 문구',
      tone: 'info',
    })
    expect(tierUpRejection(403, { code: USER_SUSPENDED_CODE }).message).toBe(d.suspension.combineBlocked)
  })

  it('모르는 reason·5xx·JSON이 아닌 응답은 오류(error)로 알리고 목록을 새로 받는다', () => {
    expect(tierUpRejection(200, { success: false, reason: 'something_new' })).toMatchObject({
      message: d.combine.genericFail,
      tone: 'error',
      refresh: true,
    })
    expect(tierUpRejection(500, { error: d.combine.genericFail }).tone).toBe('error')
    expect(tierUpRejection(502, null)).toMatchObject({ message: d.combine.genericFail, tone: 'error' })
  })

  it('거절 문구에는 확률 숫자와 운영 용어(개체·후보·소각)가 없다', () => {
    const copies = [
      d.combine.tierUp.noCandidate,
      d.combine.tierUp.invalidMaterials,
      d.combine.tierUp.invalidCount,
    ].join('\n')
    expect(copies).not.toMatch(/%|퍼센트/)
    expect(copies).not.toMatch(/개체|후보|소각/)
    expect(copies).not.toMatch(/컬렉션|5개/)
  })
})

describe('d.combine.tierUp 문구', () => {
  it('6개 기준이고 컬렉션 선택·5개·확률 숫자 표현이 없다', () => {
    const copy = JSON.stringify(d.combine.tierUp)
    expect(copy).not.toMatch(/5개|받을 컬렉션|컬렉션 고르기|다른 컬렉션을 골라|%|퍼센트/)
    expect(d.combine.tierUp).not.toHaveProperty('collectionPicker')
    expect(d.combine.tierUp).not.toHaveProperty('invalidCollection')
    expect(d.combine.tierUp.description).toContain('6개')
    expect(d.combine.tierUp.description).toContain('Mystic 6개를 넣으면 Mystic을 받아요')
    expect(d.combine.tierUp.groupShort).toBe('6개부터 넣을 수 있어요')
  })
})
