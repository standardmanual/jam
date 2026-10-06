/**
 * 묶음 상태 계산 (티켓 20260930_1817) — 상위 티켓 20260930_1455 가정 7의 조합표와 그 빈틈 (가)~(라).
 */
import { describe, it, expect } from 'vitest'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import {
  OPS_INBOX_TABS,
  OPS_STAGES,
  computeBundleStatus,
  stageCounts,
  stageOfItemStatus,
  tabOfBundleStage,
} from '@/lib/admin/opsInbox/bundleStatus'

const stageOf = (...statuses: string[]) => computeBundleStatus(statuses).stage

describe('stageOfItemStatus — PRD §7.1 대응표', () => {
  it.each([
    ['arrived', 'arrived'],
    ['reviewing', 'review'],
    ['approved', 'prepare'],
    ['preparing', 'prepare'],
    ['scheduled', 'scheduled'],
    ['live', 'live'],
    ['ended', 'ended'],
    ['rejected', null],
    ['cancelled', null],
    ['failed', null],
  ])('%s → %s', (status, stage) => {
    expect(stageOfItemStatus(status)).toBe(stage)
  })

  it('상태 10개를 모두 다룬다(빠진 값 없음)', () => {
    expect(OPS_ITEM_STATUSES).toHaveLength(10)
    for (const status of OPS_ITEM_STATUSES) {
      const stage = stageOfItemStatus(status)
      expect(stage === null || (OPS_STAGES as readonly string[]).includes(stage)).toBe(true)
    }
  })

  it('10개 밖 값은 null이다', () => {
    expect(stageOfItemStatus('unknown')).toBeNull()
    expect(stageOfItemStatus('')).toBeNull()
  })
})

describe('computeBundleStatus — 가정 7', () => {
  it('전부 도착이면 「도착」', () => {
    expect(stageOf('arrived', 'arrived')).toBe('arrived')
  })

  it('도착과 검토중이 섞이면 「검토」', () => {
    expect(stageOf('arrived', 'reviewing')).toBe('review')
    expect(stageOf('reviewing', 'reviewing')).toBe('review')
  })

  it('결정 전 항목이 하나라도 남아 있으면 이미 승인된 항목이 있어도 「검토」', () => {
    expect(stageOf('reviewing', 'approved', 'live')).toBe('review')
    expect(stageOf('arrived', 'approved')).toBe('review')
  })

  it('반려·취소는 빼고 본다: 남은 항목이 전부 도착이면 「도착」', () => {
    expect(stageOf('arrived', 'rejected', 'cancelled')).toBe('arrived')
  })

  it('반려를 뺀 나머지가 검토중이면 「검토」', () => {
    expect(stageOf('reviewing', 'rejected')).toBe('review')
  })

  it('다 결정된 뒤 승인됨·준비중이 하나라도 있으면 「준비」', () => {
    expect(stageOf('approved', 'approved')).toBe('prepare')
    expect(stageOf('preparing', 'scheduled', 'live')).toBe('prepare')
    expect(stageOf('approved', 'ended')).toBe('prepare')
  })

  it('준비가 없고 게재중이 있으면 「게재」 — 예약된 항목이 섞여도 게재다(가장 뒤처진 항목 기준이 아니다)', () => {
    expect(stageOf('live', 'scheduled')).toBe('live')
    expect(stageOf('live', 'ended')).toBe('live')
  })

  it('준비·게재가 없고 예약됨이 있으면 「예약」', () => {
    expect(stageOf('scheduled', 'ended')).toBe('scheduled')
    expect(stageOf('scheduled', 'rejected')).toBe('scheduled')
  })

  it('전부 종료면 「종료」(반려·취소가 섞여도)', () => {
    expect(stageOf('ended', 'ended')).toBe('ended')
    expect(stageOf('ended', 'rejected', 'cancelled')).toBe('ended')
  })

  it('전부 반려면 「반려」, 전부 취소면 「취소」', () => {
    expect(stageOf('rejected', 'rejected')).toBe('rejected')
    expect(stageOf('cancelled', 'cancelled')).toBe('cancelled')
  })
})

describe('computeBundleStatus — 가정 7이 정하지 않은 빈틈 (가)~(라)', () => {
  it('(가) 실패 항목은 단계 계산에서 빼고 「일부 실패」로만 알린다', () => {
    const status = computeBundleStatus(['scheduled', 'failed'])
    expect(status.stage).toBe('scheduled')
    expect(status.partialFailure).toBe(true)
    expect(computeBundleStatus(['live', 'failed']).stage).toBe('live')
    expect(computeBundleStatus(['reviewing', 'failed']).stage).toBe('review')
  })

  it('(가) 실패가 없으면 「일부 실패」가 꺼져 있다', () => {
    expect(computeBundleStatus(['scheduled', 'live']).partialFailure).toBe(false)
  })

  it('(나) 남는 항목이 없고 실패가 있으면 「실패」(반려·취소가 섞여도)', () => {
    expect(stageOf('failed', 'failed')).toBe('failed')
    expect(stageOf('failed', 'rejected')).toBe('failed')
    expect(stageOf('failed', 'cancelled', 'rejected')).toBe('failed')
  })

  it('(나) 전부 실패인 묶음은 「일부 실패」를 켜지 않는다', () => {
    expect(computeBundleStatus(['failed', 'failed']).partialFailure).toBe(false)
    expect(computeBundleStatus(['failed', 'rejected']).partialFailure).toBe(false)
  })

  it('(나) 실패가 없고 취소가 있으면 「취소」(반려와 섞여도), 반려뿐이면 「반려」', () => {
    expect(stageOf('cancelled', 'rejected')).toBe('cancelled')
    expect(stageOf('rejected', 'rejected', 'cancelled')).toBe('cancelled')
    expect(stageOf('rejected')).toBe('rejected')
  })

  it('(다) 항목이 0개이면 「도착」', () => {
    const status = computeBundleStatus([])
    expect(status.stage).toBe('arrived')
    expect(status.partialFailure).toBe(false)
    expect(status.decidedCount).toBe(0)
  })

  it('(라) 10개 밖 상태 값은 계산에서 뺀다', () => {
    expect(stageOf('live', 'weird')).toBe('live')
    expect(stageOf('weird', 'arrived')).toBe('arrived')
    expect(stageOf('weird')).toBe('arrived')
    expect(computeBundleStatus(['weird', 'ended']).decidedCount).toBe(1)
  })
})

describe('computeBundleStatus — 세는 값', () => {
  it('decidedCount는 도착·검토중이 아닌 항목 수다(반려·취소·실패도 결정된 것)', () => {
    expect(computeBundleStatus(['arrived', 'reviewing', 'approved', 'rejected', 'failed']).decidedCount).toBe(3)
    expect(computeBundleStatus(['arrived', 'arrived']).decidedCount).toBe(0)
  })

  it('offBar는 반려·취소·실패 개수다', () => {
    const status = computeBundleStatus(['reviewing', 'rejected', 'rejected', 'cancelled', 'failed'])
    expect(status.offBar).toEqual({ rejected: 2, cancelled: 1, failed: 1 })
  })
})

describe('stageCounts — 단계마다 센 항목 수', () => {
  it('여섯 단계가 모두 키로 있고 항목이 없으면 0이다', () => {
    expect(stageCounts([])).toEqual({ arrived: 0, review: 0, prepare: 0, scheduled: 0, live: 0, ended: 0 })
  })

  it('승인됨·준비중은 준비 한 칸으로 센다(PRD §7.1)', () => {
    const counts = stageCounts(['arrived', 'reviewing', 'approved', 'preparing', 'scheduled', 'live', 'live', 'ended'])
    expect(counts).toEqual({ arrived: 1, review: 1, prepare: 2, scheduled: 1, live: 2, ended: 1 })
  })

  it('반려·취소·실패와 10개 밖 값은 어느 단계에도 세지 않는다', () => {
    const counts = stageCounts(['rejected', 'cancelled', 'failed', 'unknown_status', 'live'])
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(counts.live).toBe(1)
  })
})

describe('tabOfBundleStage — S2 상태 탭', () => {
  it('결정할 것=도착·검토', () => {
    expect(tabOfBundleStage('arrived')).toBe('decide')
    expect(tabOfBundleStage('review')).toBe('decide')
  })

  it('진행 중=준비·예약·게재', () => {
    expect(tabOfBundleStage('prepare')).toBe('progress')
    expect(tabOfBundleStage('scheduled')).toBe('progress')
    expect(tabOfBundleStage('live')).toBe('progress')
  })

  it('끝남·멈춤=종료·반려·취소·실패', () => {
    for (const stage of ['ended', 'rejected', 'cancelled', 'failed'] as const) {
      expect(tabOfBundleStage(stage)).toBe('closed')
    }
  })

  it('탭은 전체·결정할 것·진행 중·끝남·멈춤 4개다', () => {
    expect([...OPS_INBOX_TABS]).toEqual(['all', 'decide', 'progress', 'closed'])
  })
})
