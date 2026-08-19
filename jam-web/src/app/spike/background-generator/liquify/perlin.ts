/**
 * Perlin 노이즈 생성기.
 *
 * 출처: collidingScopes/liquify (https://github.com/collidingScopes/liquify) — perlin.js
 * MIT 라이선스(Alan Ang). 애니메이션 모드의 리퀴드 왜곡 방향을 제어하는 데 사용한다
 * (20260819_001 스파이크 — 원본 로직을 TypeScript로 그대로 이식, 동작은 변경하지 않음).
 */
interface Vec2 {
  x: number
  y: number
}

export class Perlin {
  private gradients: Record<string, Vec2> = {}
  private memory: Record<string, number> = {}

  seed(): void {
    this.gradients = {}
    this.memory = {}
  }

  private randVect(): Vec2 {
    const theta = Math.random() * 2 * Math.PI
    return { x: Math.cos(theta), y: Math.sin(theta) }
  }

  private dotProdGrid(x: number, y: number, vx: number, vy: number): number {
    const key = `${vx},${vy}`
    let gVect = this.gradients[key]
    if (!gVect) {
      gVect = this.randVect()
      this.gradients[key] = gVect
    }
    const dVect = { x: x - vx, y: y - vy }
    return dVect.x * gVect.x + dVect.y * gVect.y
  }

  private smootherstep(x: number): number {
    return 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3
  }

  private interp(x: number, a: number, b: number): number {
    return a + this.smootherstep(x) * (b - a)
  }

  get(x: number, y: number): number {
    const key = `${x},${y}`
    if (Object.prototype.hasOwnProperty.call(this.memory, key)) {
      return this.memory[key]
    }
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const tl = this.dotProdGrid(x, y, xf, yf)
    const tr = this.dotProdGrid(x, y, xf + 1, yf)
    const bl = this.dotProdGrid(x, y, xf, yf + 1)
    const br = this.dotProdGrid(x, y, xf + 1, yf + 1)
    const xt = this.interp(x - xf, tl, tr)
    const xb = this.interp(x - xf, bl, br)
    const v = this.interp(y - yf, xt, xb)
    this.memory[key] = v
    return v
  }
}
