/**
 * `useReducedMotion`은 `src/lib/motion.ts` 한 곳에만 있다 (티켓 20261126_1407, UI 소스 정리 7-2회차).
 * 예전에는 BadgeRevealCarousel·ItemSerialCode가 같은 훅을 각자 가지고 있었다.
 * 저장소에 jsdom이 없어(vitest `environment: 'node'`) 훅을 돌리지 않고 소스 위치만 고정한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8')

describe('useReducedMotion 단일 원천', () => {
  it('lib/motion.ts가 훅을 내보낸다', () => {
    expect(read('../../../lib/motion.ts')).toMatch(/export function useReducedMotion\(\)/)
  })

  for (const file of ['BadgeRevealCarousel.tsx', 'ItemSerialCode.tsx']) {
    it(`${file}: 자체 훅을 두지 않고 lib/motion에서 가져온다`, () => {
      const src = read(`../${file}`)
      expect(src).not.toMatch(/function useReducedMotion/)
      expect(src).toMatch(/import \{ useReducedMotion \} from '@\/lib\/motion'/)
    })
  }
})
