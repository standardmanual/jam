/**
 * 승인 색 쌍 (티켓 20261007_1145)
 *
 * 지키는 것: 사용자가 확정한 값(이력 있는 쌍만), 트라이브 카드는 그 트라이브 쌍만·트라이브 없는 카드는 공통 쌍만,
 * 이력 없는 트라이브는 빈 목록, hex는 소문자 `#rrggbb`, `TRIBES.md` 「승인 색 쌍」 표와 같은 값.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { COMMON_APPROVED_PAIRS, TRIBE_APPROVED_PAIRS, approvedPairsOf, findApprovedPair, isApprovedPair } from '../tribePalettes'

const FOREST = '73f0f601-2382-900c-8ca2-5cc7c93ed95d'
const POTION = '68f3673f-7d73-996b-b4b9-49600d0f2615'
const ANALOG = 'd6969aef-2039-c997-4b55-a7ee861b32c5'
const NO_HISTORY = '3f2c9a10-5b7e-4d21-8a64-0c1e7b9d2f55'

describe('approvedPairsOf', () => {
  it('트라이브가 있으면 그 트라이브의 쌍만 준다', () => {
    expect(approvedPairsOf(FOREST).map((p) => p.name)).toEqual(['도토리 정산철', '그루터기 살롱'])
    expect(approvedPairsOf(POTION).map((p) => p.name)).toEqual(['카페인 과부하'])
    expect(approvedPairsOf(ANALOG).map((p) => p.name)).toEqual(['잃어버린 시간'])
  })

  it('tribe_id가 없으면 공통 쌍만 주고 트라이브 전용색을 섞지 않는다', () => {
    const common = approvedPairsOf(null)
    expect(common.map((p) => p.name)).toEqual(['진행 붉은색', '날씨 청록', '주말 초록', '컬렉션 마젠타', '주간 회색'])
    for (const pairs of Object.values(TRIBE_APPROVED_PAIRS)) {
      for (const pair of pairs) expect(common.some((c) => c.name === pair.name)).toBe(false)
    }
  })

  it('이력 없는 트라이브·모르는 트라이브는 빈 목록이다', () => {
    expect(approvedPairsOf(NO_HISTORY)).toEqual([])
    expect(approvedPairsOf('toString')).toEqual([])
  })
})

describe('findApprovedPair·isApprovedPair', () => {
  it('그 카드가 고를 수 있는 쌍이어야 승인 쌍이다(대소문자는 무시)', () => {
    expect(findApprovedPair(FOREST, '#8A5A2E', '#2a1a0d')?.name).toBe('그루터기 살롱')
    expect(isApprovedPair(null, '#037a49', '#052e1c')).toBe(true)
    expect(isApprovedPair(FOREST, '#037a49', '#052e1c')).toBe(false)
    expect(isApprovedPair(null, '#8a5a2e', '#3d2812')).toBe(false)
    expect(isApprovedPair(FOREST, '#8a5a2e', '#000000')).toBe(false)
  })
})

describe('값 형식과 정본 문서', () => {
  const all = [...Object.values(TRIBE_APPROVED_PAIRS).flat(), ...COMMON_APPROVED_PAIRS]

  it('hex는 소문자 #rrggbb이고 쌍 이름은 겹치지 않는다', () => {
    for (const pair of all) {
      expect(pair.bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(pair.end).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length)
  })

  it('TRIBES.md 「승인 색 쌍」 표의 모든 쌍이 상수와 같은 값이다', () => {
    const doc = readFileSync(resolve(process.cwd(), '../jam-doc/planning/content/TRIBES.md'), 'utf8')
    const section = doc.slice(doc.indexOf('## 승인 색 쌍'), doc.indexOf('## 데이터 소스'))
    const rows = [...section.matchAll(/^\| [^|]+ \| [^|]+ \| ([^|]+) \| (#[0-9a-f]{6}) \| (#[0-9a-f]{6}) \|/gm)].map((m) => ({
      name: m[1].trim(),
      bg: m[2],
      end: m[3],
    }))
    expect(rows).toHaveLength(all.length)
    for (const row of rows) expect(all).toContainEqual(row)
  })
})
