/**
 * abusing/policy — 저장 실패 전파 + 읽기 정규화 회귀 테스트
 *
 * 배경 (티켓 20260831_1149):
 * 1. `updateAbusingPolicy()`가 upsert 반환 `error`를 버려 저장 실패가 "저장됐어요"로 응답됐다.
 * 2. `PUT /api/admin/abusing/policy`에 키 화이트리스트가 없어 폼이 함께 보내는
 *    `id`·`updated_at`이 upsert 페이로드에 섞였고, 미지의 키 하나로 전체 저장이 롤백됐다.
 * 3. `getAbusingPolicy()`에 정규화·관측이 없었다. 이때는 정규화를 **원본 행의 상위집합**으로
 *    넣었다 — 마이그레이션 115 미실행 구간의 구 컬럼명을 shadow-ban.ts가 런타임 문자열로
 *    `${banLevel}_${rarity}_rate`를 조합해 찾아갈 수 있게 살려두려는 목적이었다.
 *
 * 갱신 (티켓 20260831_1259): `shadow-ban.ts`가 문자열 조합을 버리고
 * `Record<BadgeRarity, keyof AbusingPolicy>` 타입 맵을 쓰므로 구 키를 보존해도 맵이 찾지 않는다
 * — 상위집합의 근거가 사라졌다.
 *
 * 갱신 (티켓 20260831_1328): 마이그레이션 115가 적용됐고(근거 1도 소멸) 소비 지점 전수 확인
 * 결과 `DEFAULT_POLICY` 밖 키를 읽는 곳이 없어 상위집합 스프레드를 제거했다.
 * `getAbusingPolicy()`는 이제 `AbusingPolicy` 키만 돌려준다. 구 등급 케이스가 여전히 "차단"인
 * 이유는 상위집합 보존이 아니라 **미지 등급 fail-closed**다(shadow-ban.ts의 타입 맵에 없음).
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/policy-save.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import type { BadgeRarity } from '@/types/database'

/** 마이그레이션 115 적용 후의 `abusing_policy` 행 */
const POST_115_ROW: Record<string, unknown> = {
  id: 1,
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 1.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 1.0,
  hard_mystic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
  updated_at: '2026-08-13T01:28:00.090694+00:00',
}

/** 마이그레이션 115 실행 **전**의 실제 행 (조사 시점 2026-08-31 백업값) */
const PRE_115_ROW: Record<string, unknown> = {
  id: 1,
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_legendary_rate: 0.0,
  soft_mythic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_legendary_rate: 0.0,
  hard_mythic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
  updated_at: '2026-08-13T01:28:00.090694+00:00',
}

const stub = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectError: null as { code: string; message: string } | null,
  upsertError: null as { code: string; message: string } | null,
  upsertPayloads: [] as Record<string, unknown>[],
  /** createServiceClient 호출 횟수 — 클라이언트를 주입했을 때 새로 만들지 않는지 감시한다 */
  serviceClientCalls: 0,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: (): SupabaseClient => {
    stub.serviceClientCalls++
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: stub.row, error: stub.selectError }),
      upsert: async (payload: Record<string, unknown>) => {
        stub.upsertPayloads.push(payload)
        return { error: stub.upsertError }
      },
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

vi.mock('@/lib/admin/auth', () => ({
  getAdminUser: async () => ({ id: 'admin-1', email: 'admin@jam.test' }),
}))

import {
  getAbusingPolicy,
  updateAbusingPolicy,
  findPolicyRateMismatches,
  DEFAULT_POLICY,
  MIN_VEHICLE_SPEED_FILTER_KMH,
} from '../policy'
import { shouldAllowDrop } from '../shadow-ban'
import { PUT } from '@/app/api/admin/abusing/policy/route'

const fakeReq = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest

beforeEach(() => {
  stub.row = { ...POST_115_ROW }
  stub.selectError = null
  stub.upsertError = null
  stub.upsertPayloads = []
  stub.serviceClientCalls = 0
})

describe('getAbusingPolicy — DEFAULT_POLICY 키만 돌려준다', () => {
  it('마이그레이션 115 미실행 구간에서는 신규 등급 키가 기본값으로 폴백하고, 구 등급 드랍은 fail-closed로 차단된다', async () => {
    stub.row = { ...PRE_115_ROW }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const policy = await getAbusingPolicy()

    // 상위집합을 돌려주지 않으므로 구 컬럼명(soft_legendary_rate 등)은 결과에 없다 —
    // 신규 키(soft_epic_rate 등)는 PRE_115_ROW에 없어 DEFAULT_POLICY로 폴백한다.
    expect(policy.soft_epic_rate).toBe(DEFAULT_POLICY.soft_epic_rate)
    expect(policy.hard_epic_rate).toBe(DEFAULT_POLICY.hard_epic_rate)

    // 115 미실행 구간의 DB enum 값은 'mythic'/'legendary'라 타입 단언으로 그 구간을 재현한다.
    // shadow-ban.ts의 `Record<BadgeRarity, keyof AbusingPolicy>` 맵에 없는 등급이라
    // fail-closed로 차단된다 (티켓 20260831_1259) — 상위집합 보존과는 무관하다.
    expect(shouldAllowDrop('mythic' as BadgeRarity, 'soft', policy)).toBe(false)
    expect(shouldAllowDrop('legendary' as BadgeRarity, 'soft', policy)).toBe(false)
    expect(shouldAllowDrop('legendary' as BadgeRarity, 'hard', policy)).toBe(false)
    spy.mockRestore()
  })

  it('마이그레이션 115 적용 후에는 신규 키로 판정한다', async () => {
    const policy = await getAbusingPolicy()
    expect(shouldAllowDrop('mystic', 'soft', policy)).toBe(false)
    expect(shouldAllowDrop('common', 'soft', policy)).toBe(true)
    // 115의 5절 결정대로 epic 차단은 꺼진 상태(1.0)를 유지한다
    expect(shouldAllowDrop('epic', 'soft', policy)).toBe(true)
    expect(shouldAllowDrop('rare', 'hard', policy)).toBe(false)
  })

  it('NUMERIC이 문자열로 내려와도 숫자로 정규화한다', async () => {
    stub.row = { ...POST_115_ROW, soft_epic_rate: '0.30', gps_max_speed_kmh: '250' }
    const policy = await getAbusingPolicy()
    expect(policy.soft_epic_rate).toBeCloseTo(0.3)
    expect(policy.gps_max_speed_kmh).toBe(250)
  })

  it('키가 없으면 기본값으로 폴백하고 서버 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const withoutEpic = { ...POST_115_ROW }
    delete withoutEpic.soft_epic_rate
    stub.row = withoutEpic

    const policy = await getAbusingPolicy()
    expect(policy.soft_epic_rate).toBe(DEFAULT_POLICY.soft_epic_rate)
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toContain('soft_epic_rate')
    spy.mockRestore()
  })

  it('조회 실패·행 없음은 기본 정책으로 폴백하되 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.selectError = { code: 'PGRST116', message: 'no rows' }
    expect(await getAbusingPolicy()).toEqual(DEFAULT_POLICY)

    stub.selectError = null
    stub.row = null
    expect(await getAbusingPolicy()).toEqual(DEFAULT_POLICY)
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('클라이언트를 인자로 받으면 새 service_role 클라이언트를 만들지 않고 주입본으로 조회한다', async () => {
    // processFetchedActivities(supabase, ...)처럼 클라이언트를 인자로 받아 내려주는 호출부의
    // 주입 사슬을 끊지 않아야 한다 (티켓 20260831_1300)
    const injectedBuilder = {
      select: () => injectedBuilder,
      eq: () => injectedBuilder,
      single: async () => ({
        data: { ...POST_115_ROW, vehicle_speed_filter_kmh: 45 },
        error: null,
      }),
    }
    const injected = { from: () => injectedBuilder } as unknown as SupabaseClient

    const policy = await getAbusingPolicy(injected)
    expect(policy.vehicle_speed_filter_kmh).toBe(45)
    expect(stub.serviceClientCalls).toBe(0)
  })
})

describe('updateAbusingPolicy — upsert 실패 전파', () => {
  it('upsert error를 받으면 예외를 던진다 (이전에는 삼켰다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = {
      code: 'PGRST204',
      message: "Could not find the 'hard_legend_rate' column of 'abusing_policy' in the schema cache",
    }
    await expect(updateAbusingPolicy({ gps_max_speed_kmh: 300 })).rejects.toThrow('PGRST204')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('정상이면 { id: 1, ...patch, updated_at } 페이로드로 저장한다', async () => {
    await updateAbusingPolicy({ soft_epic_rate: 0.5 })
    expect(stub.upsertPayloads).toHaveLength(1)
    const payload = stub.upsertPayloads[0]
    expect(payload.id).toBe(1)
    expect(payload.soft_epic_rate).toBe(0.5)
    expect(typeof payload.updated_at).toBe('string')
  })
})

describe('findPolicyRateMismatches — DB 배율과 DEFAULT_POLICY 대조', () => {
  it('배율 8종이 모두 같으면 빈 배열을 돌려준다', () => {
    expect(findPolicyRateMismatches(DEFAULT_POLICY)).toEqual([])
  })

  it('갈라진 키만 { key, dbValue, codeValue }로 돌려준다', () => {
    const current = { ...DEFAULT_POLICY, soft_epic_rate: 0.5, hard_mystic_rate: 0.2 }
    const mismatches = findPolicyRateMismatches(current)
    expect(mismatches).toHaveLength(2)
    expect(mismatches).toContainEqual({ key: 'soft_epic_rate', dbValue: 0.5, codeValue: 1.0 })
    expect(mismatches).toContainEqual({ key: 'hard_mystic_rate', dbValue: 0.2, codeValue: 0.0 })
  })

  it('임계값 4종(gps_max_speed_kmh 등)은 대조 대상이 아니다', () => {
    const current = { ...DEFAULT_POLICY, gps_max_speed_kmh: 999 }
    expect(findPolicyRateMismatches(current)).toEqual([])
  })
})

describe('updateAbusingPolicy — 저장 시 DEFAULT_POLICY 불일치 경고', () => {
  it('저장 후 읽은 값이 DEFAULT_POLICY와 다르면 console.warn을 1회 남긴다', async () => {
    // upsert 자체는 목이라 DB를 실제로 바꾸지 않으므로, "저장 후 상태"는 select가 돌려주는
    // stub.row로 시뮬레이션한다 (기존 테스트와 동일한 방식).
    stub.row = { ...POST_115_ROW, soft_epic_rate: 0.5 }
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await updateAbusingPolicy({ soft_epic_rate: 0.5 })
    expect(spy).toHaveBeenCalledTimes(1)
    const msg = String(spy.mock.calls[0][0])
    expect(msg).toContain('soft_epic_rate')
    expect(msg).toContain('DB=0.5')
    expect(msg).toContain('policy.ts=1')
    expect(msg).toContain('DEFAULT_POLICY')
    spy.mockRestore()
  })

  it('저장 후 읽은 값이 DEFAULT_POLICY와 일치하면 console.warn을 남기지 않는다', async () => {
    stub.row = { ...POST_115_ROW }
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await updateAbusingPolicy({ gps_max_speed_kmh: 300 })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('PUT /api/admin/abusing/policy — 키 화이트리스트', () => {
  it('id·updated_at·미지의 키를 페이로드에서 제거한다', async () => {
    const res = await PUT(
      fakeReq({ ...POST_115_ROW, soft_mystic_rate: 0, unknown_key: 'x' })
    )
    expect(res.status).toBe(200)
    const payload = stub.upsertPayloads[0]
    const extraneous = Object.keys(payload).filter(
      (k) => k !== 'id' && k !== 'updated_at' && !(k in DEFAULT_POLICY)
    )
    expect(extraneous).toEqual([])
    // updated_at은 서버가 새로 찍은 값이어야 한다 (폼이 보낸 옛 값이 아니라)
    expect(payload.updated_at).not.toBe(POST_115_ROW.updated_at)
  })

  it('배율 8종은 0~1 범위를 벗어나면 400으로 거절한다', async () => {
    const res = await PUT(fakeReq({ soft_epic_rate: 1.5 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('0~1 범위를 벗어났어요')
    expect(stub.upsertPayloads).toHaveLength(0)
  })

  it('숫자가 아니거나 음수면 400으로 거절한다', async () => {
    const res = await PUT(fakeReq({ poi_block_hours: 'abc' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('0 이상의 숫자가 아니에요')

    const negative = await PUT(fakeReq({ gps_max_speed_kmh: -1 }))
    expect(negative.status).toBe(400)
    expect(stub.upsertPayloads).toHaveLength(0)
  })

  it('임계값 4종에는 상한을 씌우지 않는다', async () => {
    const res = await PUT(
      fakeReq({
        gps_max_speed_kmh: 1200,
        poi_block_hours: 240,
        vehicle_speed_filter_kmh: 90,
        gps_daily_distance_cap_km: 100000,
      })
    )
    expect(res.status).toBe(200)
    expect(stub.upsertPayloads[0].gps_daily_distance_cap_km).toBe(100000)
  })

  it('차량 속도 필터는 하한(20km/h) 미만이면 400으로 거절한다', async () => {
    // 0은 "필터 끄기"가 아니라 "전면 차단"이다 — 필터식이 `평균속도 <= 임계값`이라
    // 0이면 모든 활동이 탈락하고 배지·드랍·미션이 한꺼번에 멈춘다 (티켓 20260831_1300)
    const zero = await PUT(fakeReq({ vehicle_speed_filter_kmh: 0 }))
    expect(zero.status).toBe(400)
    expect((await zero.json()).error).toContain('차량 속도 필터')

    const tooLow = await PUT(fakeReq({ vehicle_speed_filter_kmh: 5 }))
    expect(tooLow.status).toBe(400)

    // 저장 자체가 일어나지 않아야 한다 (같은 요청의 다른 필드도 함께 롤백되면 안 되므로 사전 검증)
    expect(stub.upsertPayloads).toHaveLength(0)
  })

  it('차량 속도 필터 하한값(20km/h)은 그대로 저장한다', async () => {
    const res = await PUT(fakeReq({ vehicle_speed_filter_kmh: MIN_VEHICLE_SPEED_FILTER_KMH }))
    expect(res.status).toBe(200)
    expect(stub.upsertPayloads[0].vehicle_speed_filter_kmh).toBe(MIN_VEHICLE_SPEED_FILTER_KMH)
  })

  it('저장이 실패하면 200이 아니라 500 + 사유를 응답한다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = { code: 'PGRST204', message: 'column not found' }
    const res = await PUT(fakeReq({ soft_epic_rate: 1 }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.ok).toBeUndefined()
    expect(json.error).toContain('어뷰징 정책이 저장되지 않았어요')
    expect(json.error).toContain('PGRST204')
    spy.mockRestore()
  })

  it('저장 후 DB 값이 DEFAULT_POLICY와 갈리면 응답에 mismatch를 실어 어드민 배너가 쓸 수 있게 한다', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stub.row = { ...POST_115_ROW, soft_epic_rate: 0.5 }
    const res = await PUT(fakeReq({ soft_epic_rate: 0.5 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mismatch).toContainEqual({ key: 'soft_epic_rate', dbValue: 0.5, codeValue: 1.0 })
    spy.mockRestore()
  })

  it('일치하면 응답의 mismatch가 빈 배열이다', async () => {
    const res = await PUT(fakeReq({ gps_max_speed_kmh: 300 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mismatch).toEqual([])
  })
})
