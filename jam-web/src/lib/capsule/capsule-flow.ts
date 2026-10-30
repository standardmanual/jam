/**
 * 캡슐 채우기·열기 흐름의 결정 — 응답을 화면 동작으로 옮기는 순수 로직 (티켓 20261018_0054 1회)
 *
 * `CapsuleWidget`이 부르고, 화면 반영(상태 바꾸기·토스트·시트 닫기)만 직접 한다. 어떤 응답에 어떤 안내를 낼지는 여기서 정한다.
 *  - 이용 정지(403): 일반 실패가 아니라 info 안내다. 채우기는 `d.suspension.capsuleBlocked`, 열기는 `d.suspension.capsuleOpenBlocked`.
 *    버튼을 미리 막지 않고 서버 응답으로 판단한다(`strava/sync-flow`의 선례).
 *  - 거절: 서버가 코드에 맞춰 완성한 문구(`error`)를 그대로 보여 준다(UX 라이팅 §4.0). 값의 근거가 달라졌을 수 있으면 다시 조회한다.
 *  - 그 밖의 실패: 알려진 고정 문구(`d.capsule.fillFailed`·`openFailed`).
 *
 *  - 보류 받기(`runClaim`, 티켓 20261028_1739 1회): 성공·일부 성공·거절·이용 정지·실패를 화면이 처리할 결과로 접는다.
 *
 * 클라이언트·서버 경계: 순수 모듈이다. 요청 함수는 인자로 받는다(기본값은 클라이언트 래퍼).
 */
import { claimCapsule, fillCapsuleRequest, openCapsuleRequest, type CapsuleCall, type CapsuleClaimCall } from '@/lib/capsule/capsule-client'
import type { CapsuleBaseStatus, CapsuleFillPayload, CapsuleOpenedItem, CapsuleOpenPayload } from '@/lib/capsule/capsule-contract'
import { d, t } from '@/lib/i18n'

export interface CapsuleNotice {
  message: string
  type: 'error' | 'info'
}

export type FillOutcome =
  /** 채웠다 — 응답이 새 상태다(옛 필드만 있다. 보류·안내 값은 `GET /api/capsule`이 정한다) */
  | { kind: 'filled'; status: CapsuleBaseStatus }
  /** 채우지 못했다 — 안내를 내고, 거절이면 새 값으로 본문 단계에 돌아간다 */
  | { kind: 'notice'; notice: CapsuleNotice; backToMain: boolean; refresh: boolean }

export type OpenOutcome =
  /** 열었다 — 나온 개체와 다음 캡슐, 결과 문구 */
  | { kind: 'opened'; items: CapsuleOpenPayload['items']; next: CapsuleOpenPayload['next']; message: string }
  /**
   * 열지 못했다. `slots`가 있으면 인벤토리 빈칸 모자람이라 안내 블록으로 바꾸고, `refresh`면 값이 달라졌을 수 있어 다시 조회한다.
   */
  | { kind: 'notice'; notice: CapsuleNotice; slots?: { freeSlots?: number; neededSlots?: number }; refresh: boolean }

export type ClaimOutcome =
  /**
   * 하나 이상 받았다 — 받은 개체(받은 순서대로 모두)와 결과 문구. 받은 뒤 상태는 응답으로 계산하지 않고 다시 조회한다(`refresh`).
   * `partial`이면 남은 보류가 있거나 중간에 멈춘 것이다. `stopped`가 `insufficient_slots`면 `slots`에 빈칸 수가 있다.
   */
  | {
      kind: 'claimed'
      items: CapsuleOpenedItem[]
      message: string
      partial: boolean
      remainingPending: number
      stopped: 'none' | 'insufficient_slots' | 'error'
      slots?: { freeSlots?: number; neededSlots?: number }
      refresh: true
    }
  /**
   * 받지 못했다(빈칸 부족 거절·받을 것 없음·트라이브 없음·캡슐 바뀜·이용 정지·실패). 안내를 낸다.
   * `slots`가 있으면 빈칸 모자람이라 빈칸 줄을 갱신한다. `refresh`면 화면 값이 낡았을 수 있어 다시 조회한다.
   */
  | { kind: 'notice'; notice: CapsuleNotice; slots?: { freeSlots?: number; neededSlots?: number }; refresh: boolean }

export async function runFill(
  amount: number,
  request: (amount: number) => Promise<CapsuleCall<CapsuleFillPayload>> = fillCapsuleRequest
): Promise<FillOutcome> {
  const result = await request(amount)
  switch (result.kind) {
    case 'ok':
      return { kind: 'filled', status: result.data }
    case 'suspended':
      return { kind: 'notice', notice: { message: d.suspension.capsuleBlocked, type: 'info' }, backToMain: false, refresh: false }
    case 'rejected':
      // 입력해 둔 값의 근거(남은 양·가진 잼)가 달라졌을 수 있다 — 새 값으로 본문 단계에 돌아간다
      return { kind: 'notice', notice: { message: result.body.error, type: 'error' }, backToMain: true, refresh: true }
    case 'failed':
      return { kind: 'notice', notice: { message: d.capsule.fillFailed, type: 'error' }, backToMain: false, refresh: false }
  }
}

export async function runOpen(request: () => Promise<CapsuleCall<CapsuleOpenPayload>> = openCapsuleRequest): Promise<OpenOutcome> {
  const result = await request()
  switch (result.kind) {
    case 'ok':
      return {
        kind: 'opened',
        items: result.data.items,
        next: result.data.next,
        message: t(d.capsule.openResult, { n: result.data.items.length }),
      }
    case 'suspended':
      return { kind: 'notice', notice: { message: d.suspension.capsuleOpenBlocked, type: 'info' }, refresh: false }
    case 'rejected': {
      const notice: CapsuleNotice = { message: result.body.error, type: 'error' }
      if (result.body.code === 'insufficient_slots') {
        return { kind: 'notice', notice, slots: { freeSlots: result.body.freeSlots, neededSlots: result.body.neededSlots }, refresh: false }
      }
      // 아직 다 차지 않았다는 거절이면 화면의 값이 낡은 것이다
      return { kind: 'notice', notice, refresh: result.body.code === 'not_full' }
    }
    case 'failed':
      return { kind: 'notice', notice: { message: d.capsule.openFailed, type: 'error' }, refresh: false }
  }
}

/**
 * 보류 받기 결과를 화면 동작으로 옮긴다. 새 문구는 만들지 않는다 — 결과는 `d.capsule.openResult`(열기와 같은 결과 문구),
 * 거절은 서버가 완성한 문구(`d.capsule.claimInsufficientSlots`·`claimNoPending`·`claimNoTribe`·`changed`)를 그대로, 이용 정지는 `d.suspension.capsuleClaimBlocked`(info),
 * 그 밖의 실패는 `d.capsule.claimFailed`다. 거절은 모두 보류 상태가 달라졌을 수 있어 다시 조회한다.
 */
export async function runClaim(request: () => Promise<CapsuleClaimCall> = claimCapsule): Promise<ClaimOutcome> {
  const result = await request()
  switch (result.kind) {
    case 'ok': {
      const { claimed, remainingPending, stopped, freeSlots, neededSlots } = result.data
      const items = claimed.flatMap((c) => c.items)
      return {
        kind: 'claimed',
        items,
        message: t(d.capsule.openResult, { n: items.length }),
        partial: stopped !== 'none' || remainingPending > 0,
        remainingPending,
        stopped,
        ...(stopped === 'insufficient_slots' ? { slots: { freeSlots, neededSlots } } : {}),
        refresh: true,
      }
    }
    case 'suspended':
      return { kind: 'notice', notice: { message: d.suspension.capsuleClaimBlocked, type: 'info' }, refresh: false }
    case 'rejected': {
      const notice: CapsuleNotice = { message: result.body.error, type: 'error' }
      if (result.body.code === 'insufficient_slots') {
        return { kind: 'notice', notice, slots: { freeSlots: result.body.freeSlots, neededSlots: result.body.neededSlots }, refresh: true }
      }
      return { kind: 'notice', notice, refresh: true }
    }
    case 'failed':
      return { kind: 'notice', notice: { message: d.capsule.claimFailed, type: 'error' }, refresh: false }
  }
}
