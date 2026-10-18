/**
 * 캡슐 채우기·열기 흐름의 결정 (티켓 20261018_0054 1회)
 *
 * 응답 종류(성공 / 이용 정지 / 거절 / 실패)마다 어떤 안내와 화면 동작이 나오는지 고정한다. 이용 정지는 일반 실패가 아니라 info다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-flow.test.ts
 */
import { describe, expect, it, vi } from 'vitest'
import { runFill, runOpen } from '../capsule-flow'
import type { CapsuleFillPayload, CapsuleOpenPayload } from '../capsule-contract'
import { d, t } from '@/lib/i18n'

const FILL_OK: CapsuleFillPayload = {
  applied: 40,
  required: 300,
  filled: 160,
  remaining: 140,
  balance: 10,
  openable: false,
  notOpenableReason: 'not_full',
}

const OPEN_OK: CapsuleOpenPayload = {
  openId: 'o1',
  items: [
    { locked: false, inventoryItemId: 'i1', badgeId: 'b1', name: '바람의 깃', imageUrl: null, rarity: 'rare', serialNumber: 7 },
    { locked: true, inventoryItemId: 'i2', rarity: 'common', unlockRequired: 60 },
  ],
  next: { required: 400, filled: 0 },
}

describe('runFill', () => {
  it('성공하면 응답이 새 상태다', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'ok', data: FILL_OK })
    expect(await runFill(40, request)).toEqual({ kind: 'filled', status: FILL_OK })
    expect(request).toHaveBeenCalledWith(40)
  })

  it('이용 정지는 일반 실패가 아니라 info 안내다(버튼을 미리 막지 않고 응답으로 판단한다)', async () => {
    const outcome = await runFill(40, async () => ({ kind: 'suspended' }))
    expect(outcome).toEqual({
      kind: 'notice',
      notice: { message: d.suspension.capsuleBlocked, type: 'info' },
      backToMain: false,
      refresh: false,
    })
  })

  it('거절은 서버 문구를 그대로 보여 주고 새 값으로 본문 단계에 돌아간다', async () => {
    const body = { error: '남은 양보다 많이는 채울 수 없어요.', code: 'exceeds_remaining' as const, remaining: 30 }
    const outcome = await runFill(500, async () => ({ kind: 'rejected', status: 400, body }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: body.error, type: 'error' }, backToMain: true, refresh: true })
  })

  it('그 밖의 실패는 알려진 고정 문구다', async () => {
    const outcome = await runFill(40, async () => ({ kind: 'failed' }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: d.capsule.fillFailed, type: 'error' }, backToMain: false, refresh: false })
  })
})

describe('runOpen', () => {
  it('성공하면 나온 개체, 다음 캡슐, «캡슐을 열었어요. 아이템 배지 {n}개를 얻었어요.»를 돌려준다', async () => {
    const outcome = await runOpen(async () => ({ kind: 'ok', data: OPEN_OK }))
    expect(outcome).toEqual({
      kind: 'opened',
      items: OPEN_OK.items,
      next: OPEN_OK.next,
      message: t(d.capsule.openResult, { n: 2 }),
    })
    expect(outcome.kind === 'opened' && outcome.message).toBe('캡슐을 열었어요. 아이템 배지 2개를 얻었어요.')
  })

  it('이용 정지는 info 안내다', async () => {
    const outcome = await runOpen(async () => ({ kind: 'suspended' }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: d.suspension.capsuleOpenBlocked, type: 'info' }, refresh: false })
  })

  it('인벤토리 빈칸 모자람은 빈칸 수를 실어 안내 블록으로 바꾼다(다시 조회하지 않는다)', async () => {
    const body = { error: '인벤토리 빈칸이 모자라요.', code: 'insufficient_slots' as const, freeSlots: 1, neededSlots: 3 }
    const outcome = await runOpen(async () => ({ kind: 'rejected', status: 409, body }))
    expect(outcome).toEqual({
      kind: 'notice',
      notice: { message: body.error, type: 'error' },
      slots: { freeSlots: 1, neededSlots: 3 },
      refresh: false,
    })
  })

  it('아직 다 차지 않았다는 거절은 값이 낡은 것이라 다시 조회한다', async () => {
    const body = { error: '캡슐이 아직 다 차지 않아서 열 수 없어요.', code: 'not_full' as const }
    const outcome = await runOpen(async () => ({ kind: 'rejected', status: 409, body }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: body.error, type: 'error' }, refresh: true })
  })

  it('트라이브가 없다는 거절은 서버 문구만 보이고 다시 조회하지 않는다', async () => {
    const body = { error: '소속 트라이브가 없어서 캡슐을 열 수 없어요.', code: 'no_tribe' as const }
    const outcome = await runOpen(async () => ({ kind: 'rejected', status: 409, body }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: body.error, type: 'error' }, refresh: false })
  })

  it('그 밖의 실패는 알려진 고정 문구다', async () => {
    const outcome = await runOpen(async () => ({ kind: 'failed' }))
    expect(outcome).toEqual({ kind: 'notice', notice: { message: d.capsule.openFailed, type: 'error' }, refresh: false })
  })
})

describe('문구 규칙', () => {
  it('열기를 부추기는 말과 낮은 등급을 낮추어 보는 말이 캡슐 화면 문구에 없다', () => {
    const all = JSON.stringify([d.capsule.title, d.capsule.pill, d.capsule.aria, d.capsule.sheet, d.capsule.fill, d.capsule.openResult])
    expect(all).not.toMatch(/한 번만 더|곧 좋은|꽝|대박|행운/)
  })
})
