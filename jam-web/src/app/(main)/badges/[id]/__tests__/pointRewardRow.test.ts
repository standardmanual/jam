/**
 * 배지 상세의 포인트 보상 안내 — 미션 상세의 보상 행과 같은 모양, 지급 표현 없음 (2026-11-09 사용자 지시)
 *
 * 화면 전체를 렌더하지 않고 두 가지를 고정한다: 문구(사전)와 행의 구성(소스).
 *  - 문구는 미션 상세의 «N 포인트»와 같고, «드렸어요»·«드려요» 같은 지급 표현과 획득 전후 분기가 없다.
 *  - 행은 `ListRow tone="tint"` + 서클 lead + `CoinIcon`이다(미션 상세의 포인트 보상 행과 같은 구성).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/pointRewardRow.test.ts"
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { d } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'

const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf-8')
const mission = readFileSync(new URL('../../../missions/[id]/MissionDetailClient.tsx', import.meta.url), 'utf-8')

describe('배지 상세 포인트 보상 문구', () => {
  it('미션 상세와 같은 «N 포인트»다', () => {
    expect(d.badges.pointRewardLine).toBe('{points} 포인트')
    expect(d.badges.pointRewardLine).toBe(d.missions.rewardPointsLine)
    // tPoint는 조각 배열(포인트 값은 강조색 요소)을 돌려준다 — 값이 조각 안에 들어 있는지만 본다
    expect(JSON.stringify(tPoint(d.badges.pointRewardLine, { points: '20' }))).toContain('20')
  })

  it('지급 표현과 획득 전후 문구 키가 없다', () => {
    const keys = Object.keys(d.badges)
    expect(keys).not.toContain('pointRewardEarned')
    expect(keys).not.toContain('pointRewardPending')
    expect(d.badges.pointRewardLine).not.toMatch(/드렸|드려|지급|받/)
  })
})

describe('배지 상세 포인트 보상 행', () => {
  it('ListRow tone="tint" + 서클 lead + CoinIcon이고 획득 여부로 가르지 않는다', () => {
    const block = page.slice(page.indexOf('badgeRow.point_reward > 0'), page.indexOf('badgeRow.point_reward > 0') + 900)

    for (const part of ['<ListRow', 'tone="tint"', 'leadShape="round"', '<CoinIcon', 'd.badges.pointRewardLine']) {
      expect(block, part).toContain(part)
    }
    expect(block).not.toContain('hasEarned')
    expect(block).not.toContain('<Card')
  })

  it('미션 상세의 포인트 보상 행과 같은 구성이다', () => {
    const missionBlock = mission.slice(mission.indexOf('포인트 보상 행'), mission.indexOf('포인트 보상 행') + 700)

    for (const part of ['tone="tint"', 'leadShape="round"', '<CoinIcon', "background: 'var(--accent)'", "color: 'var(--accent-foreground)'"]) {
      expect(missionBlock, part).toContain(part)
      expect(page, part).toContain(part)
    }
  })
})
