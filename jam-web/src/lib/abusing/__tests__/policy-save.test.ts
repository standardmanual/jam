/**
 * abusing/policy — 읽기 정규화 회귀 테스트
 *
 * 티켓 20261022_1134(7-3 2회): 저장 경로를 지웠다. 어뷰징 기준값은 밸런스 설정 «어뷰징» 구역(`lib/admin/balance/abusing.ts`)이 저장하고
 * 그 시험은 `lib/admin/balance/__tests__/abusing.test.ts`에 있다. 옛 `updateAbusingPolicy`(upsert 실패 전파)와 `PUT·GET /api/admin/abusing/policy`
 * (키 화이트리스트, 최소값 검사, 500 응답) 시험은 함수와 라우트와 함께 없어졌다. 이 파일은 읽기(`getAbusingPolicy`)만 본다.
 * (파일 이름의 «save»는 저장 시험이 있던 때의 이름이 남은 것이다.)
 *
 * 티켓 20261021_1250(6-4 2회): 옛 섀도우밴 드랍 배율 8칸(`soft_*_rate`·`hard_*_rate`)과 불일치 대조(`findPolicyRateMismatches`)·
 * 저장 시 불일치 경고·`mismatch` 응답·배율 0~1 검증을 지웠다. 이 파일은 남은 칸(GPS 임계값·장소 블록 시간·차량 속도 필터·교통수단·종목 불일치)의
 * 읽기만 본다. DB 행에는 옛 배율 열이 아직 있으므로(6-4 4회 정리 SQL 몫) 픽스처 행에도 그대로 둔다.
 *
 * 배경 (티켓 20260831_1149): `getAbusingPolicy()`에 정규화·관측이 없었다. 이때는 정규화를 **원본 행의 상위집합**으로
 * 넣었다 — 마이그레이션 115 미실행 구간의 구 컬럼명을 shadow-ban.ts가 런타임 문자열로
 * `${banLevel}_${rarity}_rate`를 조합해 찾아갈 수 있게 살려두려는 목적이었다.
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
 * 시험은 함수와 함께 없어졌다. 위 «구 컬럼명 보존» 근거도 같이 사라졌다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/policy-save.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    }
    return { from: () => builder } as unknown as SupabaseClient
  },
}))

import { getAbusingPolicy, DEFAULT_POLICY } from '../policy'

beforeEach(() => {
  stub.row = { ...POST_115_ROW }
  stub.selectError = null
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
