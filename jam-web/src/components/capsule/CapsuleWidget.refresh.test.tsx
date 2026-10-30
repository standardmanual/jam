/**
 * 캡슐 위젯이 서버의 새 초기값을 따라가는지 (티켓 20261028_1740 3회 재작업)
 *
 * 동기화 뒤 `router.refresh()`로 레이아웃과 홈이 다시 그려지면 위젯에는 새 `initial`이 내려온다.
 * 위젯이 첫 값만 쥐고 있으면 합친 연출을 닫을 때 게이지가 동기화 이전 값까지만 찬다.
 * `CapsuleWidget.test.tsx`는 서버 렌더로 첫 화면을 보고, 이 파일은 훅 실행기(`__tests__/hookRunner.ts`)로 다시 그리기를 본다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleWidget.refresh.test.tsx
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => (await import('./__tests__/hookRunner')).mockReact(await importOriginal<typeof import('react')>()))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
const fetchCapsule = vi.fn()
vi.mock('@/lib/capsule/capsule-client', () => ({ fetchCapsule: () => fetchCapsule() }))

import CapsuleWidget from './CapsuleWidget'
import CapsuleGauge from './CapsuleGauge'
import { findAll, mount, rerender, unmount } from './__tests__/hookRunner'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const status = (over: Partial<CapsuleStatus> = {}): CapsuleStatus => ({
  required: 300,
  filled: 120,
  remaining: 180,
  balance: 777,
  openable: false,
  notOpenableReason: 'not_full',
  pendingCount: 0,
  jamBlocked: false,
  alertStage: 0,
  claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 },
  notice: 'none',
  ...over,
})

const gaugeProps = () => findAll((e) => e.type === CapsuleGauge)[0].props as { filled: number; required: number }

afterEach(() => {
  unmount()
  fetchCapsule.mockReset()
})

describe('서버가 새 초기값을 내려주면', () => {
  it('게이지가 새 채운 양과 필요량을 따라간다', () => {
    mount(CapsuleWidget, { initial: status({ filled: 120, required: 300 }) })
    expect(gaugeProps()).toMatchObject({ filled: 120, required: 300 })

    rerender({ initial: status({ filled: 40, required: 360 }) })
    expect(gaugeProps()).toMatchObject({ filled: 40, required: 360 })
  })

  it('같은 초기값으로 다시 그려도 상태를 덮어쓰지 않는다', () => {
    const initial = status({ filled: 120 })
    mount(CapsuleWidget, { initial })
    rerender({ initial })
    expect(gaugeProps().filled).toBe(120)
  })

  it('처음에 초기값이 없어 불러오는 중이었어도 새 초기값이 오면 바로 게이지를 그린다', () => {
    fetchCapsule.mockReturnValue(new Promise(() => {}))
    mount(CapsuleWidget, { initial: undefined as CapsuleStatus | undefined })
    expect(findAll((e) => e.type === CapsuleGauge)).toHaveLength(0)

    rerender({ initial: status({ filled: 200 }) })
    expect(gaugeProps().filled).toBe(200)
  })
})
