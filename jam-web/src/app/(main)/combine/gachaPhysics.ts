/**
 * 등급 UP 가차머신 돔 안 물리 — 순수 함수 모듈 (티켓 20261127_2225).
 * 프로토타입(`docs/assets/prototypes/20261127_tier-up-gacha-prototype.html`)의 `step()`을 그대로 옮겼다. 좌표는 256×256 돔 그림 기준이다.
 * 난수는 `rng`로 주입해 시험에서 같은 결과를 만든다. 그리기·시간 흐름은 `TierUpGachaStage.tsx`가 맡는다.
 */

/** 돔 중심 좌표(256 기준) */
export const DOME_CENTER = 128
/** 공이 움직일 수 있는 안쪽 반지름 */
export const DOME_INNER_RADIUS = 119
/** 공 반지름 */
export const BALL_RADIUS = 33
/** 공 생성 간격(ms) */
export const BALL_SPAWN_INTERVAL_MS = 110
/** 이 반지름 이하는 그리지 않는다(음수 반지름 그리기 오류로 섞기가 멈췄던 버그 방지) */
export const MIN_DRAW_RADIUS = 1.5

export interface GachaBall {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  rot: number
  vr: number
  /** 앞뒤 깊이: -1 뒤 ~ 1 앞 */
  z: number
  vz: number
  /** 소용돌이 방향(1 또는 -1) */
  spin: number
  /** 생성 시각(ms). 막 생긴 공이 튀어나오듯 커지는 연출에 쓴다 */
  born: number
}

export type Rng = () => number

/** i번째(0~5) 공을 돔 위쪽에서 만든다 */
export function spawnGachaBall(i: number, rng: Rng, now = 0): GachaBall {
  return {
    x: DOME_CENTER + (i - 2.5) * 18 + (rng() - 0.5) * 6,
    y: 44,
    vx: (rng() - 0.5) * 140,
    vy: 160 + rng() * 80,
    r: BALL_RADIUS,
    rot: rng() * Math.PI * 2,
    vr: (rng() - 0.5) * 6,
    z: rng() * 2 - 1,
    vz: (rng() - 0.5) * 2,
    spin: rng() < 0.5 ? -1 : 1,
    born: now,
  }
}

/** 깊이에 따라 달라 보이는 반지름 */
export function visualRadius(b: Pick<GachaBall, 'r' | 'z'>): number {
  return b.r * (1 + 0.14 * b.z)
}

/**
 * 한 걸음(h초) 진행한다. `blower`가 참이면 아래쪽 1/3에서 위로 부는 바람 + 소용돌이 + 난류가 더해진다.
 * 공은 제자리에서 바뀐다.
 */
export function stepGachaBalls(balls: GachaBall[], h: number, blower: boolean, rng: Rng): void {
  const C = DOME_CENTER
  for (const b of balls) {
    b.vy += 820 * h
    if (blower) {
      const dx = b.x - C
      const dy = b.y - C
      // 아래쪽 1/3에 들어온 공만 위로 세게 밀어 올린다(위쪽에 붙어 버리지 않게)
      if (dy > 34) b.vy -= (2600 + rng() * 2600) * h
      // 돔 중심을 도는 소용돌이
      const d = Math.hypot(dx, dy) || 1
      b.vx += (-dy / d) * 900 * h * b.spin
      b.vy += (dx / d) * 900 * h * b.spin
      // 난류
      b.vx += (rng() - 0.5) * 3200 * h
      b.vy += (rng() - 0.5) * 1600 * h
      if (rng() < 0.015) b.spin = -b.spin
      // 앞뒤 깊이도 계속 바뀐다
      b.vz += (rng() - 0.5) * 18 * h
    }
    const sp = Math.hypot(b.vx, b.vy)
    if (sp > 720) {
      b.vx *= 720 / sp
      b.vy *= 720 / sp
    }
    b.x += b.vx * h
    b.y += b.vy * h
    b.z += b.vz * h
    if (b.z > 1) {
      b.z = 1
      b.vz = -Math.abs(b.vz)
    }
    if (b.z < -1) {
      b.z = -1
      b.vz = Math.abs(b.vz)
    }
    b.vz = Math.max(-2.4, Math.min(2.4, b.vz))
    b.rot += b.vr * h
    b.vr *= 0.996
    // 유리 벽(깊이에 따라 보이는 크기가 달라 벽까지의 거리도 맞춘다)
    const er = visualRadius(b)
    const dx = b.x - C
    const dy = b.y - C
    const d = Math.hypot(dx, dy) || 1
    const lim = DOME_INNER_RADIUS - er
    if (d > lim) {
      const nx = dx / d
      const ny = dy / d
      b.x = C + nx * lim
      b.y = C + ny * lim
      const vn = b.vx * nx + b.vy * ny
      if (vn > 0) {
        b.vx -= 1.6 * vn * nx
        b.vy -= 1.6 * vn * ny
        const vt = -b.vx * ny + b.vy * nx
        b.vr = vt / b.r
      }
    }
  }
  // 공끼리: 깊이가 가까운 공만 부딪히고, 나머지는 앞뒤로 겹쳐 지나간다
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i]
      const c = balls[j]
      if (Math.abs(a.z - c.z) > 0.38) continue
      const dx = c.x - a.x
      const dy = c.y - a.y
      const d = Math.hypot(dx, dy) || 0.01
      const min = (a.r + c.r) * 0.92
      if (d < min) {
        const nx = dx / d
        const ny = dy / d
        const o = (min - d) / 2
        a.x -= nx * o
        a.y -= ny * o
        c.x += nx * o
        c.y += ny * o
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
        if (rv < 0) {
          const imp = (-1.7 * rv) / 2
          a.vx -= imp * nx
          a.vy -= imp * ny
          c.vx += imp * nx
          c.vy += imp * ny
          a.vr += (rng() - 0.5) * 4
          c.vr += (rng() - 0.5) * 4
          // 부딪히면 앞뒤로 살짝 갈라진다
          const sz = a.z < c.z ? -1 : 1
          a.vz += sz * 0.6
          c.vz -= sz * 0.6
        }
      }
    }
  }
}

/** 중앙으로 나올 공의 순번 — 돔 가운데에 가깝고 앞쪽(z가 큰)인 공. 공이 없으면 -1 */
export function pickWinner(balls: readonly GachaBall[]): number {
  let winner = -1
  let best = Infinity
  balls.forEach((b, i) => {
    const score = Math.hypot(b.x - DOME_CENTER, b.y - (DOME_CENTER - 10)) - b.z * 40
    if (score < best) {
      best = score
      winner = i
    }
  })
  return winner
}
