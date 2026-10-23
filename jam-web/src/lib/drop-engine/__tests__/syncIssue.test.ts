/**
 * drop-engine/syncIssue — 동기화 아이템 배지 발급 순수 판정 (티켓 20261017_1424 1회)
 *
 * 분포는 시드를 고정한 난수(mulberry32)로 대량 시뮬레이션해 고정한다. 값 근거는 운영 로직 6.7절이다.
 * 공용 DB·Strava는 호출하지 않는다.
 *
 * 오차 범위(표본 N회, 시드 고정이라 결과는 매번 같다. 허용치는 표준오차의 10배 이상으로 잡았다)
 *  - 개수 평균: ±0.01 (N=200,000, 표준오차 약 0.001)
 *  - 등급 비율: Common·Rare ±0.005, Epic ±0.003, Mystic ±0.0015 (N=200,000, 표준오차 0.0008 / 0.0004 / 0.00016)
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/syncIssue.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_JAM_POLICY } from '@/lib/jam/policy'
import {
  isIssuableBook,
  listIssueCandidates,
  pickItemBadge,
  pickWithRarityFallback,
  rollItemCount,
  rollRarity,
  type IssueBadge,
  type IssueBook,
  type SyncIssuePolicy,
} from '../syncIssue'
import type { BadgeRarity } from '@/types/database'

/** 시드 고정 난수 — [0, 1) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const POLICY: SyncIssuePolicy = DEFAULT_JAM_POLICY
const N = 200_000

function meanCount(policy: SyncIssuePolicy, jam: number, isHiking: boolean, seed: number): number {
  const rand = mulberry32(seed)
  let sum = 0
  for (let i = 0; i < N; i++) sum += rollItemCount(policy, { jam, isHiking }, rand)
  return sum / N
}

describe('rollItemCount — 개수', () => {
  it('60분 걷기(잼 60)의 평균은 운영 로직 6.7절 값 약 1.2개다 (±0.01)', () => {
    expect(Math.abs(meanCount(POLICY, 60, false, 1) - 1.2)).toBeLessThan(0.01)
  })

  it('37분 러닝(잼 111)의 평균은 약 1.37개다 (±0.01)', () => {
    expect(Math.abs(meanCount(POLICY, 111, false, 2) - 1.37)).toBeLessThan(0.01)
  })

  it('잼 300 이상은 상한 25%라 평균 1.5개다 (±0.01), 잼이 더 커도 같다', () => {
    expect(Math.abs(meanCount(POLICY, 300, false, 3) - 1.5)).toBeLessThan(0.01)
    expect(Math.abs(meanCount(POLICY, 5000, false, 4) - 1.5)).toBeLessThan(0.01)
  })

  it('활동마다 1~3개다 (등산 제외)', () => {
    const rand = mulberry32(5)
    const seen = new Set<number>()
    // 루프 안에서 매번 expect를 부르면 20만 번 호출이 느린 러너에서 기본 제한 5초를 넘긴다(티켓 20261023_1422). 최솟값·최댓값을 모아 한 번에 확인한다.
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < N; i++) {
      const c = rollItemCount(POLICY, { jam: 200, isHiking: false }, rand)
      if (c < min) min = c
      if (c > max) max = c
      seen.add(c)
    }
    expect(min).toBeGreaterThanOrEqual(1)
    expect(max).toBeLessThanOrEqual(3)
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('등산은 최소 2개이고 최대 4개다', () => {
    const rand = mulberry32(6)
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < N; i++) {
      const c = rollItemCount(POLICY, { jam: 400, isHiking: true }, rand)
      if (c < min) min = c
      if (c > max) max = c
    }
    expect(min).toBeGreaterThanOrEqual(2)
    expect(max).toBeLessThanOrEqual(4)
  })

  it('잼이 0 이하이면 보너스 없이 확정 개수만이다', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      expect(rollItemCount(POLICY, { jam: 0, isHiking: false }, rand)).toBe(1)
      expect(rollItemCount(POLICY, { jam: -50, isHiking: false }, rand)).toBe(1)
      expect(rollItemCount(POLICY, { jam: 0, isHiking: true }, rand)).toBe(2)
    }
  })

  it('확정 개수 0 설정은 드랍 없음이다 (보너스를 굴리지도 않는다)', () => {
    const zero: SyncIssuePolicy = { ...POLICY, sync_item_guaranteed: 0, sync_item_guaranteed_hiking: 0 }
    let calls = 0
    const rand = () => {
      calls += 1
      return 0 // 보너스가 굴려졌다면 전부 성공하는 값
    }
    for (let i = 0; i < 1000; i++) {
      expect(rollItemCount(zero, { jam: 1000, isHiking: false }, rand)).toBe(0)
      expect(rollItemCount(zero, { jam: 1000, isHiking: true }, rand)).toBe(0)
    }
    expect(calls).toBe(0)
  })

  it('등산 확정 0·일반 확정 1처럼 따로 설정하면 각자 따른다', () => {
    const p: SyncIssuePolicy = { ...POLICY, sync_item_guaranteed_hiking: 0 }
    expect(rollItemCount(p, { jam: 0, isHiking: true }, () => 0.99)).toBe(0)
    expect(rollItemCount(p, { jam: 0, isHiking: false }, () => 0.99)).toBe(1)
  })

  it('보너스 횟수 0 설정은 확정 개수만이다', () => {
    const p: SyncIssuePolicy = { ...POLICY, sync_item_bonus_rolls: 0 }
    expect(rollItemCount(p, { jam: 1000, isHiking: false }, () => 0)).toBe(1)
  })

  it('보너스는 굴림 횟수만큼만 더해진다 (난수가 항상 성공이어도 확정 + 2)', () => {
    expect(rollItemCount(POLICY, { jam: 1000, isHiking: false }, () => 0)).toBe(3)
  })

  it('보너스 확률 경계: 난수가 확률과 같으면 실패, 바로 아래면 성공 (잼 60 → 0.1)', () => {
    expect(rollItemCount(POLICY, { jam: 60, isHiking: false }, () => 0.1)).toBe(1)
    expect(rollItemCount(POLICY, { jam: 60, isHiking: false }, () => 0.0999)).toBe(3)
  })
})

describe('rollRarity — 등급', () => {
  it('streak 0에서 등급 비율이 설정 확률과 오차 범위 안에서 같다 (Common 84 / Rare 13 / Epic 2.5 / Mystic 0.5)', () => {
    const rand = mulberry32(11)
    const counts: Record<BadgeRarity, number> = { common: 0, rare: 0, epic: 0, mystic: 0 }
    for (let i = 0; i < N; i++) counts[rollRarity(POLICY, 0, rand).rarity] += 1
    expect(Math.abs(counts.common / N - 0.84)).toBeLessThan(0.005)
    expect(Math.abs(counts.rare / N - 0.13)).toBeLessThan(0.005)
    expect(Math.abs(counts.epic / N - 0.025)).toBeLessThan(0.003)
    expect(Math.abs(counts.mystic / N - 0.005)).toBeLessThan(0.0015)
  })

  it('common_streak가 임계값 이상이면 Common이 나오지 않고 Rare 이상 비율은 설정 확률 비율(13 : 2.5 : 0.5)을 따른다', () => {
    const rand = mulberry32(12)
    const counts: Record<BadgeRarity, number> = { common: 0, rare: 0, epic: 0, mystic: 0 }
    for (let i = 0; i < N; i++) counts[rollRarity(POLICY, 10, rand).rarity] += 1
    expect(counts.common).toBe(0)
    const total = 13 + 2.5 + 0.5
    expect(Math.abs(counts.rare / N - 13 / total)).toBeLessThan(0.005)
    expect(Math.abs(counts.epic / N - 2.5 / total)).toBeLessThan(0.005)
    expect(Math.abs(counts.mystic / N - 0.5 / total)).toBeLessThan(0.003)
  })

  it('임계값 경계: 9는 보정 없음, 10은 보정, 11 이상도 보정이다', () => {
    // 난수 0 = 첫 항목. 보정이 없으면 common, 있으면 rare
    expect(rollRarity(POLICY, 9, () => 0).rarity).toBe('common')
    expect(rollRarity(POLICY, 10, () => 0).rarity).toBe('rare')
    expect(rollRarity(POLICY, 25, () => 0).rarity).toBe('rare')
  })

  it('임계값은 설정을 따른다 (3으로 두면 3번째 연속 뒤부터)', () => {
    const p: SyncIssuePolicy = { ...POLICY, common_streak_threshold: 3 }
    expect(rollRarity(p, 2, () => 0).rarity).toBe('common')
    expect(rollRarity(p, 3, () => 0).rarity).toBe('rare')
  })

  it('다음 common_streak: Common이면 +1, 그 밖은 0이다', () => {
    expect(rollRarity(POLICY, 4, () => 0)).toEqual({ rarity: 'common', nextCommonStreak: 5 })
    expect(rollRarity(POLICY, 4, () => 0.9)).toEqual({ rarity: 'rare', nextCommonStreak: 0 })
    expect(rollRarity(POLICY, 4, () => 0.999)).toEqual({ rarity: 'mystic', nextCommonStreak: 0 })
    // 보정으로 Rare 이상이 나오면 0으로 돌아간다
    expect(rollRarity(POLICY, 10, () => 0)).toEqual({ rarity: 'rare', nextCommonStreak: 0 })
  })

  it('연속으로 이어 굴려도 Common은 임계값(10)번을 넘겨 이어지지 않고, 그 다음은 Rare 이상이다', () => {
    const rand = mulberry32(13)
    let streak = 0
    let run = 0
    let maxRun = 0
    let afterTen = 0
    let afterTenRarePlus = 0
    for (let i = 0; i < N; i++) {
      const wasAtThreshold = streak >= 10
      const r = rollRarity(POLICY, streak, rand)
      streak = r.nextCommonStreak
      if (wasAtThreshold) {
        afterTen += 1
        if (r.rarity !== 'common') afterTenRarePlus += 1
      }
      run = r.rarity === 'common' ? run + 1 : 0
      maxRun = Math.max(maxRun, run)
    }
    expect(maxRun).toBe(10)
    expect(afterTen).toBeGreaterThan(0) // 보정 경로를 실제로 지났다
    expect(afterTenRarePlus).toBe(afterTen)
  })

  it('등급 확률을 바꾸면 따른다 (Common 0%면 Common이 나오지 않는다, 난수 0에서도)', () => {
    const p: SyncIssuePolicy = {
      ...POLICY,
      sync_rarity_common: 0,
      sync_rarity_rare: 50,
      sync_rarity_epic: 50,
      sync_rarity_mystic: 0,
    }
    const rand = mulberry32(14)
    for (let i = 0; i < 5000; i++) {
      const { rarity } = rollRarity(p, 0, rand)
      expect(['rare', 'epic']).toContain(rarity)
    }
    expect(rollRarity(p, 0, () => 0).rarity).toBe('rare')
  })
})

// ── 후보 선정 ──────────────────────────────────────────────

const NOW = new Date('2026-10-17T00:00:00Z')
const MY_TRIBE = 'tribe-mine'
const OTHER_TRIBE = 'tribe-other'

function book(id: string, over: Partial<IssueBook> = {}): IssueBook {
  return {
    id,
    tribe_id: MY_TRIBE,
    is_active: true,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    ...over,
  }
}

function badge(id: string, bookId: string | null, over: Partial<IssueBadge> = {}): IssueBadge {
  return {
    id,
    rarity: 'common',
    item_book_id: bookId,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    deleted_at: null,
    ...over,
  }
}

function ids(list: IssueBadge[]): string[] {
  return list.map((b) => b.id).sort()
}

describe('listIssueCandidates / pickItemBadge — 후보', () => {
  const base = { tribeId: MY_TRIBE, rarity: 'common' as BadgeRarity, now: NOW }

  it('소속 트라이브 컬렉션의 해당 등급 배지가 전부 후보다 (여러 컬렉션에 걸쳐도)', () => {
    const books = [book('b1'), book('b2')]
    const badges = [badge('x1', 'b1'), badge('x2', 'b1'), badge('x3', 'b2')]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['x1', 'x2', 'x3'])
  })

  it('다른 트라이브의 배지는 후보에 들지 않는다', () => {
    const books = [book('b1'), book('b9', { tribe_id: OTHER_TRIBE })]
    const badges = [badge('mine', 'b1'), badge('theirs', 'b9')]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['mine'])
  })

  it('트라이브가 없는 컬렉션(tribe_id null)의 배지도 후보에 들지 않는다', () => {
    const books = [book('b1'), book('bn', { tribe_id: null })]
    const badges = [badge('mine', 'b1'), badge('none', 'bn')]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['mine'])
  })

  it('다른 등급은 후보에 들지 않고, 등급이 없는(null) 배지도 들지 않는다', () => {
    const books = [book('b1')]
    const badges = [
      badge('c', 'b1', { rarity: 'common' }),
      badge('r', 'b1', { rarity: 'rare' }),
      badge('n', 'b1', { rarity: null }),
    ]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['c'])
    expect(ids(listIssueCandidates({ ...base, rarity: 'rare', books, badges }))).toEqual(['r'])
  })

  it('비활성 컬렉션의 배지는 후보에 들지 않는다', () => {
    const books = [book('b1'), book('off', { is_active: false })]
    const badges = [badge('on', 'b1'), badge('off', 'off')]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['on'])
  })

  it('드랍 제외 컬렉션·드랍 제외 배지는 후보에 들지 않는다', () => {
    const books = [book('b1'), book('bx', { drop_excluded: true })]
    const badges = [badge('ok', 'b1'), badge('inExcludedBook', 'bx'), badge('excluded', 'b1', { drop_excluded: true })]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['ok'])
  })

  it('삭제된 배지는 후보에 들지 않는다', () => {
    const books = [book('b1')]
    const badges = [badge('ok', 'b1'), badge('gone', 'b1', { deleted_at: '2026-10-01T00:00:00Z' })]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['ok'])
  })

  it('컬렉션 없이 떠 있는 배지(item_book_id null, 목록에 없는 컬렉션)는 후보에 들지 않는다', () => {
    const books = [book('b1')]
    const badges = [badge('ok', 'b1'), badge('orphan', null), badge('unknownBook', 'bz')]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['ok'])
  })

  it('공개 기간: 시작 전·종료 후 배지는 빠지고, 안에 있거나 경계(종료 정각)는 들어간다', () => {
    const books = [book('b1')]
    const badges = [
      badge('open', 'b1'),
      badge('inside', 'b1', { valid_from: '2026-10-01T00:00:00Z', valid_until: '2026-11-01T00:00:00Z' }),
      badge('notYet', 'b1', { valid_from: '2026-10-18T00:00:00Z' }),
      badge('ended', 'b1', { valid_until: '2026-10-16T23:59:59Z' }),
      badge('endsNow', 'b1', { valid_until: '2026-10-17T00:00:00Z' }),
      badge('startsNow', 'b1', { valid_from: '2026-10-17T00:00:00Z' }),
      badge('offsetFmt', 'b1', { valid_until: '2026-10-17T09:00:00+09:00' }),
    ]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(
      ['endsNow', 'inside', 'offsetFmt', 'open', 'startsNow'].sort()
    )
  })

  it('공개 기간이 끝난·시작 전인 컬렉션의 배지는 후보에 들지 않는다', () => {
    const books = [
      book('b1'),
      book('ended', { valid_until: '2026-10-01T00:00:00Z' }),
      book('notYet', { valid_from: '2026-11-01T00:00:00Z' }),
    ]
    const badges = [badge('ok', 'b1'), badge('e', 'ended'), badge('n', 'notYet')]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['ok'])
  })

  it('날짜를 읽을 수 없는 값은 안전하게 후보에서 뺀다', () => {
    const books = [book('b1')]
    const badges = [badge('ok', 'b1'), badge('bad', 'b1', { valid_until: 'not-a-date' })]
    expect(ids(listIssueCandidates({ ...base, books, badges }))).toEqual(['ok'])
  })

  it('후보가 없으면 null이다 (난수를 쓰지 않는다)', () => {
    let calls = 0
    const picked = pickItemBadge({ ...base, books: [book('b1')], badges: [] }, () => {
      calls += 1
      return 0
    })
    expect(picked).toBeNull()
    expect(calls).toBe(0)
  })

  it('후보에서 하나를 균등하게 고른다 — 난수 경계와 1.0 방어', () => {
    const books = [book('b1')]
    const badges = [badge('a', 'b1'), badge('b', 'b1'), badge('c', 'b1'), badge('d', 'b1')]
    const input = { ...base, books, badges }
    expect(pickItemBadge(input, () => 0)?.id).toBe('a')
    expect(pickItemBadge(input, () => 0.26)?.id).toBe('b')
    expect(pickItemBadge(input, () => 0.99)?.id).toBe('d')
    expect(pickItemBadge(input, () => 1)?.id).toBe('d')
  })

  it('보정이 없다 — 컬렉션 크기·보유 여부와 상관없이 후보 한 개당 확률이 같다 (시드 고정, ±0.01)', () => {
    // 컬렉션 b1에 3개, b2에 1개: 컬렉션 비중이 있으면 b2 배지가 25%에서 벗어난다
    const books = [book('b1'), book('b2')]
    const badges = [badge('a', 'b1'), badge('b', 'b1'), badge('c', 'b1'), badge('d', 'b2')]
    const rand = mulberry32(21)
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    const M = 100_000
    for (let i = 0; i < M; i++) {
      counts[pickItemBadge({ ...base, books, badges }, rand)!.id] += 1
    }
    for (const id of Object.keys(counts)) {
      expect(Math.abs(counts[id] / M - 0.25)).toBeLessThan(0.01)
    }
  })

  it('트라이브가 바뀌면 새 트라이브의 배지가 후보다', () => {
    const books = [book('b1'), book('b9', { tribe_id: OTHER_TRIBE })]
    const badges = [badge('mine', 'b1'), badge('theirs', 'b9')]
    expect(ids(listIssueCandidates({ ...base, tribeId: OTHER_TRIBE, books, badges }))).toEqual(['theirs'])
  })
})

describe('isIssuableBook — 발급할 수 있는 컬렉션 (등급 올리기의 고른 컬렉션 검사와 후보 목록이 같은 판정을 쓴다)', () => {
  it('소속 트라이브의 활성이고 드랍 제외가 아니며 공개 기간 안인 컬렉션이다', () => {
    expect(isIssuableBook(book('b1'), MY_TRIBE, NOW)).toBe(true)
    expect(isIssuableBook(book('b1', { valid_from: '2026-10-01T00:00:00Z', valid_until: '2026-11-01T00:00:00Z' }), MY_TRIBE, NOW)).toBe(true)
  })

  it('다른 트라이브·트라이브 없음·비활성·드랍 제외·공개 전·공개 끝은 아니다', () => {
    expect(isIssuableBook(book('b1', { tribe_id: OTHER_TRIBE }), MY_TRIBE, NOW)).toBe(false)
    expect(isIssuableBook(book('b1', { tribe_id: null }), MY_TRIBE, NOW)).toBe(false)
    expect(isIssuableBook(book('b1', { is_active: false }), MY_TRIBE, NOW)).toBe(false)
    expect(isIssuableBook(book('b1', { drop_excluded: true }), MY_TRIBE, NOW)).toBe(false)
    expect(isIssuableBook(book('b1', { valid_from: '2026-11-01T00:00:00Z' }), MY_TRIBE, NOW)).toBe(false)
    expect(isIssuableBook(book('b1', { valid_until: '2026-10-01T00:00:00Z' }), MY_TRIBE, NOW)).toBe(false)
  })

  it('후보 목록과 같은 판정이다 — 이 함수가 거짓인 컬렉션의 배지는 후보에 없다', () => {
    const closed = [
      book('c1', { tribe_id: OTHER_TRIBE }),
      book('c2', { is_active: false }),
      book('c3', { drop_excluded: true }),
      book('c4', { valid_from: '2026-11-01T00:00:00Z' }),
      book('c5', { valid_until: '2026-10-01T00:00:00Z' }),
    ]
    const badges = closed.map((b) => badge(`in-${b.id}`, b.id))
    for (const b of closed) expect(isIssuableBook(b, MY_TRIBE, NOW), b.id).toBe(false)
    expect(listIssueCandidates({ tribeId: MY_TRIBE, rarity: 'common', now: NOW, books: closed, badges })).toEqual([])
  })
})

describe('pickWithRarityFallback — 후보 없는 등급은 한 등급씩 내려 다시 뽑는다 (2회)', () => {
  const books = [book('b1')]
  const fb = (rolledRarity: BadgeRarity, badges: IssueBadge[], rand: () => number = () => 0) =>
    pickWithRarityFallback({ tribeId: MY_TRIBE, rolledRarity, books, badges, now: NOW }, rand)

  it('뽑힌 등급에 후보가 있으면 내려가지 않는다 — 뽑힌 등급과 실제 등급이 같다', () => {
    const result = fb('epic', [badge('e1', 'b1', { rarity: 'epic' }), badge('c1', 'b1')])
    expect(result).toMatchObject({ rolledRarity: 'epic', rarity: 'epic', badge: { id: 'e1' } })
  })

  it('후보가 없으면 한 등급씩 내려가 후보가 있는 가장 높은 등급에서 고른다', () => {
    const badges = [badge('r1', 'b1', { rarity: 'rare' }), badge('c1', 'b1')]
    // mystic → epic(없음) → rare(있음)
    expect(fb('mystic', badges)).toMatchObject({ rolledRarity: 'mystic', rarity: 'rare', badge: { id: 'r1' } })
    // rare 후보가 없으면 common까지
    expect(fb('mystic', [badge('c1', 'b1')])).toMatchObject({ rolledRarity: 'mystic', rarity: 'common' })
  })

  it('위쪽 등급으로는 올라가지 않는다 — common을 뽑았는데 common 후보가 없으면 null이다', () => {
    expect(fb('common', [badge('r1', 'b1', { rarity: 'rare' }), badge('m1', 'b1', { rarity: 'mystic' })])).toBeNull()
  })

  it('모든 등급에 후보가 없으면 null이다', () => {
    expect(fb('mystic', [])).toBeNull()
  })

  it('내려간 등급에서도 다른 트라이브의 배지는 후보에 들지 않는다', () => {
    const otherBooks = [book('b1'), book('b9', { tribe_id: OTHER_TRIBE })]
    const result = pickWithRarityFallback(
      {
        tribeId: MY_TRIBE,
        rolledRarity: 'epic',
        books: otherBooks,
        badges: [badge('theirs', 'b9', { rarity: 'rare' }), badge('mine', 'b1')],
        now: NOW,
      },
      () => 0
    )
    expect(result).toMatchObject({ rarity: 'common', badge: { id: 'mine' } })
  })

  it('이름·이미지 같은 추가 칸을 실은 배지도 그대로 돌려준다', () => {
    const result = pickWithRarityFallback(
      { tribeId: MY_TRIBE, rolledRarity: 'common', books, badges: [{ ...badge('c1', 'b1'), name: '추가 칸' }], now: NOW },
      () => 0
    )
    expect(result?.badge.name).toBe('추가 칸')
  })
})

describe('경계 — 서버 전용 모듈을 가져오지 않는다', () => {
  it('syncIssue.ts는 supabase/server·next/headers를 정적·동적으로 가져오지 않는다', () => {
    const src = readFileSync(join(__dirname, '..', 'syncIssue.ts'), 'utf8')
    // 주석을 뺀 코드에서 import 문과 import() 호출만 모은다
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const imports = [...code.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(imports).not.toContain('@/lib/supabase/server')
    expect(imports).not.toContain('next/headers')
    expect(imports.some((i) => i.includes('supabase/server') || i.startsWith('next/'))).toBe(false)
    // 런타임 import는 없고 타입 import뿐이다
    expect(/^import\s+(?!type\b)/m.test(code)).toBe(false)
  })
})
