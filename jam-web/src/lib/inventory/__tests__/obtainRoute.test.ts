/**
 * 아이템 배지 개체의 받은 경로 해석 (2026-11-09 사용자 지시)
 *
 * 캡슐에서 나온 개체도 `obtained_by`가 `drop`이라 발급 기록의 경로(`capsule`)를 먼저 본다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/obtainRoute.test.ts
 */
import { describe, it, expect } from 'vitest'
import { resolveObtainRoute } from '../obtainRoute'
import { d } from '@/lib/i18n'
import { CAPSULE_ISSUE_ROUTE } from '@/lib/capsule/open'
import { SYNC_ISSUE_ROUTE } from '@/lib/drop-engine/syncIssueRun'

describe('resolveObtainRoute', () => {
  it('발급 기록의 경로가 캡슐이면 obtained_by가 drop이어도 캡슐 열기 보상이다', () => {
    expect(resolveObtainRoute('drop', 'capsule')).toBe('capsule')
    expect(resolveObtainRoute('system_event', 'capsule')).toBe('capsule')
  })

  it('활동 동기화로 받은 개체는 활동 드랍이다(발급 기록이 없어도 obtained_by=drop이면 같다)', () => {
    expect(resolveObtainRoute('drop', 'sync')).toBe('activity')
    expect(resolveObtainRoute('drop', null)).toBe('activity')
    expect(resolveObtainRoute('drop', undefined)).toBe('activity')
  })

  it('픽업과 지점 드랍은 체크인 픽업이다', () => {
    expect(resolveObtainRoute('pickup', null)).toBe('checkinPickup')
    expect(resolveObtainRoute('ambient_drop', null)).toBe('checkinPickup')
  })

  it('이벤트 드랍과 그 밖의 값은 각각 이벤트 드랍, 시스템 지급이다', () => {
    expect(resolveObtainRoute('drop_event', null)).toBe('event')
    expect(resolveObtainRoute('system_event', null)).toBe('system')
    expect(resolveObtainRoute('seed_full', null)).toBe('system')
    expect(resolveObtainRoute('뭔지 모르는 값', 'unknown')).toBe('system')
  })

  it('미션 보상 기록이 있으면 mission이고, 발급 기록이 있으면 발급 기록이 앞선다', () => {
    expect(resolveObtainRoute('system_event', null, true)).toBe('mission')
    expect(resolveObtainRoute('system_event', null, false)).toBe('system')
    expect(resolveObtainRoute('system_event', 'capsule', true)).toBe('capsule')
    expect(resolveObtainRoute('system_event', 'sync', true)).toBe('activity')
  })

  it('코드가 쓰는 경로 값과 같은 문자열을 본다', () => {
    expect(CAPSULE_ISSUE_ROUTE).toBe('capsule')
    expect(SYNC_ISSUE_ROUTE).toBe('sync')
  })
})

describe('받은 경로 문구', () => {
  it('경로마다 맥락과 행위가 함께 읽히는 문구다', () => {
    expect(d.inventory.obtainByCapsule).toBe('캡슐 열기 보상')
    expect(d.inventory.obtainByDrop).toBe('활동 동기화 드랍')
    expect(d.inventory.obtainByMission).toBe('미션 보상')
    expect(d.inventory.obtainByPickup).toBe('체크인 픽업')
    expect(d.inventory.obtainByDropEvent).toBe('이벤트 드랍')
    expect(d.inventory.obtainBySystem).toBe('시스템 지급')
  })
})
