import { describe, expect, it } from 'vitest'
import {
  BALL_SPAWN_INTERVAL_MS,
  DOME_CENTER,
  DOME_INNER_RADIUS,
  pickWinner,
  spawnGachaBall,
  stepGachaBalls,
  type GachaBall,
} from './gachaPhysics'

/** 시험용 결정적 난수(LCG) */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const FRAME = 1 / 60
const SUBSTEPS = 3

/** 공 6개를 0.11초 간격으로 만들고 `shuffleSeconds`초 섞으며 매 프레임 `onFrame`을 부른다 */
function simulate(seed: number, shuffleSeconds: number, onFrame: (balls: GachaBall[], t: number) => void) {
  const rng = seeded(seed)
  const balls: GachaBall[] = []
  const spawnAt = Array.from({ length: 6 }, (_, i) => (i * BALL_SPAWN_INTERVAL_MS) / 1000)
  const blowerFrom = spawnAt[5] + 0.32
  const total = blowerFrom + shuffleSeconds
  let t = 0
  while (t < total) {
    while (balls.length < 6 && t >= spawnAt[balls.length]) balls.push(spawnGachaBall(balls.length, rng))
    for (let k = 0; k < SUBSTEPS; k++) stepGachaBalls(balls, FRAME / SUBSTEPS, t >= blowerFrom, rng)
    onFrame(balls, t)
    t += FRAME
  }
  return balls
}

describe('stepGachaBalls', () => {
  it('3초를 섞어도 모든 공이 돔 안에 있다', () => {
    for (const seed of [1, 7, 42]) {
      simulate(seed, 3, (balls) => {
        for (const b of balls) {
          expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true)
          expect(Math.hypot(b.x - DOME_CENTER, b.y - DOME_CENTER)).toBeLessThanOrEqual(DOME_INNER_RADIUS)
        }
      })
    }
  })

  it('섞는 동안 공이 위·가운데·아래에 고르게 퍼진다(위쪽에 몰려 붙지 않는다)', () => {
    let upper = 0
    let middle = 0
    let lower = 0
    let samples = 0
    simulate(3, 3, (balls, t) => {
      if (t < 1) return
      for (const b of balls) {
        const dy = b.y - DOME_CENTER
        if (dy < -30) upper++
        else if (dy > 30) lower++
        else middle++
        samples++
      }
    })
    expect(upper / samples).toBeGreaterThan(0.12)
    expect(middle / samples).toBeGreaterThan(0.12)
    expect(lower / samples).toBeGreaterThan(0.12)
    expect(upper / samples).toBeLessThan(0.6)
  })
})

describe('pickWinner', () => {
  const base = { vx: 0, vy: 0, r: 33, rot: 0, vr: 0, vz: 0, spin: 1, born: 0 }

  it('가운데에 가깝고 앞쪽인 공을 고른다', () => {
    const balls: GachaBall[] = [
      { ...base, x: 40, y: 200, z: 0 },
      { ...base, x: 128, y: 118, z: 0 },
      { ...base, x: 130, y: 120, z: 1 },
      { ...base, x: 200, y: 60, z: -1 },
    ]
    expect(pickWinner(balls)).toBe(2)
  })

  it('같은 입력이면 늘 같은 공을 고르고, 공이 없으면 -1이다', () => {
    const balls: GachaBall[] = [
      { ...base, x: 100, y: 100, z: 0.2 },
      { ...base, x: 150, y: 150, z: 0.9 },
    ]
    expect(pickWinner(balls)).toBe(pickWinner(balls))
    expect(pickWinner([])).toBe(-1)
  })
})
