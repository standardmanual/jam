/**
 * abusing/policy — 저장 실패 전파 + 읽기 정규화 회귀 테스트
 *
 * 티켓 20261021_1250(6-4 2회): 옛 섀도우밴 드랍 배율 8칸(`soft_*_rate`·`hard_*_rate`)과 불일치 대조(`findPolicyRateMismatches`)·
 * 저장 시 불일치 경고·`mismatch` 응답·배율 0~1 검증을 지웠다. 이 파일은 남은 칸(GPS 임계값·장소 블록 시간·차량 속도 필터·교통수단·종목 불일치)의
 * 읽기·저장만 본다. DB 행에는 옛 배율 열이 아직 있으므로(6-4 4회 정리 SQL 몫) 픽스처 행에도 그대로 둔다.
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
 * `getAbusingPolicy()`는 이제 `AbusingPolicy` 키만 돌려준다.
 *
 * 갱신 (티켓 20261021_1250, 6-4 2회): `shadow-ban.ts`(와 `shouldAllowDrop`)를 지웠으므로 «미지 등급 fail-closed»
 * 시험은 함수와 함께 없어졌다. 위 3번의 «구 컬럼명 보존» 근거도 같이 사라졌다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/policy-save.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

/** 마이그레이션 115 적용 후의 `abusing_policy` 행 — 옛 배율 열 8개가 그대로 들어 있다(코드는 읽지 않는다) */
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
  transit_walk_max_speed_kmh: 20,
  transit_run_max_speed_kmh: 27,
  transit_cycling_max_speed_kmh: 55,
  transit_segment_min_duration_sec: 30,
  mismatch_run_min_speed_kmh: 6,
  mismatch_cycling_min_speed_kmh: 10,
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
  DEFAULT_POLICY,
  MIN_VEHICLE_SPEED_FILTER_KMH,
} from '../policy'
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
  it('행에 옛 배율 열 8개가 있어도 결과에 담지 않고, 없어도 읽기가 깨지지 않으며 로그도 남기지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const RATE_COLUMNS = [
      'soft_common_rate', 'soft_rare_rate', 'soft_epic_rate', 'soft_mystic_rate',
      'hard_common_rate', 'hard_rare_rate', 'hard_epic_rate', 'hard_mystic_rate',
    ]

    const withRates = await getAbusingPolicy() // POST_115_ROW에는 배율 열 8개가 있다
    expect(Object.keys(withRates).filter((k) => RATE_COLUMNS.includes(k))).toEqual([])
    expect(withRates.gps_max_speed_kmh).toBe(300)

    const withoutRates = { ...POST_115_ROW }
    for (const column of RATE_COLUMNS) delete withoutRates[column]
    stub.row = withoutRates
    const policy = await getAbusingPolicy()
    expect(policy).toEqual(withRates)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('NUMERIC이 문자열로 내려와도 숫자로 정규화한다', async () => {
    stub.row = { ...POST_115_ROW, transit_run_max_speed_kmh: '27.5', gps_max_speed_kmh: '250' }
    const policy = await getAbusingPolicy()
    expect(policy.transit_run_max_speed_kmh).toBeCloseTo(27.5)
    expect(policy.gps_max_speed_kmh).toBe(250)
  })

  it('키가 없으면 기본값으로 폴백하고 서버 로그를 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const withoutWalk = { ...POST_115_ROW }
    delete withoutWalk.transit_walk_max_speed_kmh
    stub.row = withoutWalk

    const policy = await getAbusingPolicy()
    expect(policy.transit_walk_max_speed_kmh).toBe(DEFAULT_POLICY.transit_walk_max_speed_kmh)
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toContain('transit_walk_max_speed_kmh')
    spy.mockRestore()
  })

  it('종목 불일치 기준값은 DB 값을 그대로 읽고, 0 이하·비정상 값은 기본값(6·10)으로 대체하며 로그를 남긴다', async () => {
    stub.row = { ...POST_115_ROW, mismatch_run_min_speed_kmh: 7, mismatch_cycling_min_speed_kmh: '12' }
    const ok = await getAbusingPolicy()
    expect(ok.mismatch_run_min_speed_kmh).toBe(7)
    expect(ok.mismatch_cycling_min_speed_kmh).toBe(12)

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.row = { ...POST_115_ROW, mismatch_run_min_speed_kmh: 0, mismatch_cycling_min_speed_kmh: -3 }
    const bad = await getAbusingPolicy()
    expect(bad.mismatch_run_min_speed_kmh).toBe(DEFAULT_POLICY.mismatch_run_min_speed_kmh)
    expect(bad.mismatch_cycling_min_speed_kmh).toBe(DEFAULT_POLICY.mismatch_cycling_min_speed_kmh)
    expect(String(spy.mock.calls[0][0])).toContain('mismatch_run_min_speed_kmh')
    expect(DEFAULT_POLICY.mismatch_run_min_speed_kmh).toBe(6)
    expect(DEFAULT_POLICY.mismatch_cycling_min_speed_kmh).toBe(10)
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
    await updateAbusingPolicy({ poi_block_hours: 48 })
    expect(stub.upsertPayloads).toHaveLength(1)
    const payload = stub.upsertPayloads[0]
    expect(payload.id).toBe(1)
    expect(payload.poi_block_hours).toBe(48)
    expect(typeof payload.updated_at).toBe('string')
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
    // 폼이 옛 배율 칸을 함께 보내도(열려 있던 옛 화면) 저장 본문에는 실리지 않는다
    expect(Object.keys(payload).filter((k) => /^(soft|hard)_.*_rate$/.test(k))).toEqual([])
    // updated_at은 서버가 새로 찍은 값이어야 한다 (폼이 보낸 옛 값이 아니라)
    expect(payload.updated_at).not.toBe(POST_115_ROW.updated_at)
  })

  it('옛 배율 키는 본문에 와도 0~1 검증 없이 버려지고, 함께 보낸 다른 칸은 저장된다', async () => {
    const res = await PUT(fakeReq({ soft_epic_rate: 1.5, gps_max_speed_kmh: 301 }))
    expect(res.status).toBe(200)
    expect(stub.upsertPayloads).toHaveLength(1)
    expect(stub.upsertPayloads[0].gps_max_speed_kmh).toBe(301)
    expect('soft_epic_rate' in stub.upsertPayloads[0]).toBe(false)
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

  it('종목 불일치 기준값은 상한 없는 양의 정수만 저장한다', async () => {
    const ok = await PUT(fakeReq({ mismatch_run_min_speed_kmh: 8, mismatch_cycling_min_speed_kmh: 100000 }))
    expect(ok.status).toBe(200)
    expect(stub.upsertPayloads[0].mismatch_run_min_speed_kmh).toBe(8)
    expect(stub.upsertPayloads[0].mismatch_cycling_min_speed_kmh).toBe(100000)

    stub.upsertPayloads = []
    for (const bad of [0, 5.5]) {
      const res = await PUT(fakeReq({ mismatch_run_min_speed_kmh: bad }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('mismatch_run_min_speed_kmh')
    }
    const negative = await PUT(fakeReq({ mismatch_cycling_min_speed_kmh: -1 }))
    expect(negative.status).toBe(400)
    expect(stub.upsertPayloads).toHaveLength(0)
  })

  it('저장이 실패하면 200이 아니라 500 + 사유를 응답한다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stub.upsertError = { code: 'PGRST204', message: 'column not found' }
    const res = await PUT(fakeReq({ gps_max_speed_kmh: 300 }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.ok).toBeUndefined()
    expect(json.error).toContain('어뷰징 정책이 저장되지 않았어요')
    expect(json.error).toContain('PGRST204')
    spy.mockRestore()
  })

  it('응답에 mismatch(옛 배율 불일치 경고)가 없고 저장 직후 읽은 정책을 돌려준다', async () => {
    const res = await PUT(fakeReq({ gps_max_speed_kmh: 300 }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mismatch).toBeUndefined()
    expect(json.ok).toBe(true)
    expect(json.policy.gps_max_speed_kmh).toBe(300)
  })

  it('저장 후 읽은 값이 DEFAULT_POLICY와 달라도 경고 로그를 남기지 않는다', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stub.row = { ...POST_115_ROW, gps_max_speed_kmh: 999 }
    await updateAbusingPolicy({ gps_max_speed_kmh: 999 })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('GET /api/admin/abusing/policy', () => {
  it('정책만 돌려주고 mismatch는 없다', async () => {
    const { GET } = await import('@/app/api/admin/abusing/policy/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.mismatch).toBeUndefined()
    expect(json.policy.poi_block_hours).toBe(72)
  })
})
