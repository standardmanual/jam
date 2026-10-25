/**
 * lib/badge/pointPolicy — `badge_point_policy` 로더와 마이그레이션 288 (티켓 20261022_1135 1회)
 *
 * 고정하는 것
 *  - 코드 기본값(`DEFAULT_BADGE_POINT_POLICY`)이 마이그레이션 288 파일의 DEFAULT 리터럴(10·20·50·100·10)과 같다 — 한쪽만 바꾸면 폴백 경로와 정상 경로의 기본값이 갈린다.
 *  - 288 파일은 추가만 한다: 새 표 하나, RLS 켬, anon·authenticated 권한 회수, 시드 행, 파일 끝 되돌림 SQL 블록. 기존 표를 바꾸는 문장이 없다.
 *  - 정상 행은 그대로 읽는다 · 조회 실패·행 없음·예외는 기본값과 로그 · 비정상 칸(음수·소수·문자열 아님)은 그 칸만 기본값으로 대체하고 나머지는 DB 값을 쓴다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge/__tests__/pointPolicy.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

import {
  BADGE_POINT_POLICY_KEYS,
  BADGE_POINT_POLICY_SELECT,
  DEFAULT_BADGE_POINT_POLICY,
  getBadgePointPolicy,
  isValidBadgePoints,
} from '../pointPolicy'

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/288_badge_point_policy.sql'), 'utf8')

/** SQL에서 코드(주석 제외)만 남긴다 */
const SQL_CODE = SQL.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function fakeClient(result: { data: unknown; error: unknown } | 'throw'): { client: SupabaseClient; selects: string[] } {
  const selects: string[] = []
  const client = {
    from: (table: string) => {
      expect(table).toBe('badge_point_policy')
      return {
        select: (columns: string) => {
          selects.push(columns)
          return {
            eq: (column: string, value: unknown) => {
              expect([column, value]).toEqual(['id', 1])
              return {
                single: async () => {
                  if (result === 'throw') throw new Error('network')
                  return result
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, selects }
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.restoreAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('마이그레이션 288 ↔ 코드 기본값', () => {
  it('코드 기본값이 288 파일의 DEFAULT 리터럴과 같다(10·20·50·100·10)', () => {
    const defaults = Object.fromEntries(
      [...SQL_CODE.matchAll(/^\s*(\w+_points)\s+INTEGER NOT NULL DEFAULT (\d+)\s+CHECK \(\1 >= 0\)/gm)].map((match) => [match[1], Number(match[2])])
    )
    expect(defaults).toEqual({ common_points: 10, rare_points: 20, epic_points: 50, mystic_points: 100, leveled_points: 10 })
    expect(DEFAULT_BADGE_POINT_POLICY).toEqual(defaults)
  })

  it('288은 새 표 하나만 만들고 id=1 한 행으로 막으며 RLS를 켜고 anon·authenticated 권한을 회수한다', () => {
    expect([...SQL_CODE.matchAll(/CREATE TABLE/g)]).toHaveLength(1)
    expect(SQL_CODE).toMatch(/CREATE TABLE IF NOT EXISTS public\.badge_point_policy/)
    expect(SQL_CODE).toMatch(/id\s+INTEGER PRIMARY KEY DEFAULT 1 CHECK \(id = 1\)/)
    expect(SQL_CODE).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/)
    expect(SQL_CODE).toMatch(/ALTER TABLE public\.badge_point_policy ENABLE ROW LEVEL SECURITY;/)
    expect(SQL_CODE).toMatch(/REVOKE ALL ON public\.badge_point_policy FROM anon, authenticated;/)
    expect(SQL_CODE).toMatch(/INSERT INTO public\.badge_point_policy \(id\) VALUES \(1\) ON CONFLICT \(id\) DO NOTHING;/)
    // 정책(CREATE POLICY)은 두지 않는다 — 서버(service_role)만 접근한다
    expect(SQL_CODE).not.toMatch(/CREATE POLICY/)
  })

  it('288은 추가만 한다: 이 표 밖의 표·열·함수를 바꾸는 문장이 없다', () => {
    expect(SQL_CODE).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b/i)
    expect(SQL_CODE).not.toMatch(/\bDROP\b/i)
    expect(SQL_CODE).not.toMatch(/CREATE (OR REPLACE )?(FUNCTION|TRIGGER)/i)
    for (const match of SQL_CODE.matchAll(/ALTER TABLE (\S+)/g)) expect(match[1]).toBe('public.badge_point_policy')
    expect(SQL_CODE).not.toMatch(/public\.badges\b/)
  })

  it('288 파일 끝에 되돌림 SQL 블록이 있고 새 표만 지운다', () => {
    const lines = SQL.trimEnd().split('\n')
    const marker = lines.findIndex((line) => line.startsWith('-- 되돌림 SQL'))
    expect(marker).toBeGreaterThan(0)
    expect(lines.slice(marker).join('\n')).toMatch(/^-- DROP TABLE IF EXISTS public\.badge_point_policy;$/m)
  })

  it('288의 적용 전후 확인 쿼리가 행 수 1과 값 10/20/50/100/10을 적어 둔다', () => {
    expect(SQL).toMatch(/to_regclass\('public\.badge_point_policy'\)/)
    expect(SQL).toMatch(/relrowsecurity/)
    expect(SQL).toMatch(/SELECT count\(\*\) FROM public\.badge_point_policy;\s+-- 1/)
    expect(SQL).toMatch(/-- 1, 10, 20, 50, 100, 10/)
  })
})

describe('칸 목록', () => {
  it('칸 이름이 Common → Rare → Epic → Mystic → 레벨형 순서이고 기본값 상수의 키 전부다', () => {
    expect([...BADGE_POINT_POLICY_KEYS]).toEqual(['common_points', 'rare_points', 'epic_points', 'mystic_points', 'leveled_points'])
    expect(Object.keys(DEFAULT_BADGE_POINT_POLICY)).toEqual([...BADGE_POINT_POLICY_KEYS])
    expect(BADGE_POINT_POLICY_SELECT.split(',').map((column) => column.trim())).toEqual([...BADGE_POINT_POLICY_KEYS])
  })

  it('칸 값 검사는 0 이상 정수만 통과시킨다(DB CHECK와 같다)', () => {
    for (const good of [0, 1, 10, 2_147_483_647]) expect(isValidBadgePoints(good), String(good)).toBe(true)
    for (const bad of [-1, 1.5, NaN, Infinity]) expect(isValidBadgePoints(bad), String(bad)).toBe(false)
  })
})

describe('getBadgePointPolicy', () => {
  it('정상 행은 그대로 읽는다(기본값과 다른 값 포함) · id=1 행에서 5칸만 요청한다', async () => {
    const { client, selects } = fakeClient({
      data: { common_points: 15, rare_points: 25, epic_points: 60, mystic_points: 0, leveled_points: 12 },
      error: null,
    })
    expect(await getBadgePointPolicy(client)).toEqual({ common_points: 15, rare_points: 25, epic_points: 60, mystic_points: 0, leveled_points: 12 })
    expect(selects).toEqual([BADGE_POINT_POLICY_SELECT])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('조회 실패는 기본값과 로그다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'relation "badge_point_policy" does not exist' } })
    expect(await getBadgePointPolicy(client)).toEqual(DEFAULT_BADGE_POINT_POLICY)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('조회 실패'), expect.anything())
  })

  it('행이 없으면 기본값과 로그다', async () => {
    const { client } = fakeClient({ data: null, error: null })
    expect(await getBadgePointPolicy(client)).toEqual(DEFAULT_BADGE_POINT_POLICY)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('id=1 행이 없음'))
  })

  it('예외가 나도 던지지 않고 기본값과 로그다', async () => {
    const { client } = fakeClient('throw')
    expect(await getBadgePointPolicy(client)).toEqual(DEFAULT_BADGE_POINT_POLICY)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('예외'), expect.any(Error))
  })

  it('비정상 칸(음수·소수·비어 있음)은 그 칸만 기본값으로 대체하고 나머지는 DB 값을 쓴다', async () => {
    const { client } = fakeClient({
      data: { common_points: -5, rare_points: 25.5, epic_points: null, mystic_points: 120, leveled_points: 7 },
      error: null,
    })
    expect(await getBadgePointPolicy(client)).toEqual({ common_points: 10, rare_points: 20, epic_points: 50, mystic_points: 120, leveled_points: 7 })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('common_points, rare_points, epic_points'))
  })

  it('반환값을 바꿔도 기본값 상수는 바뀌지 않는다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    const policy = await getBadgePointPolicy(client)
    policy.common_points = 999
    expect(DEFAULT_BADGE_POINT_POLICY.common_points).toBe(10)
  })
})
