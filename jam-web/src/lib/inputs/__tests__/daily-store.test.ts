/**
 * lib/inputs/daily-store — 저장값 읽기·쓰기 계약 (티켓 20260923_2333 게이트 WARN 후속)
 *
 * 읽기는 요청 경로라 어떤 실패에서도 던지지 않고 null을 준다. 쓰기는 cron 전용이라 실패를 던진다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createServiceClient } = vi.hoisted(() => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient }))

import { readDailyInput, writeDailyInput, ymdToDateKst } from '../daily-store'

function readClient(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }
  createServiceClient.mockReturnValue({ from: vi.fn(() => chain) })
  return chain
}

beforeEach(() => {
  createServiceClient.mockReset()
})

describe('ymdToDateKst', () => {
  it('YYYYMMDD를 YYYY-MM-DD로 바꾼다', () => {
    expect(ymdToDateKst('20260924')).toBe('2026-09-24')
  })
})

describe('readDailyInput', () => {
  it('행이 있으면 value를 반환하고 kind·date_kst로 조회한다', async () => {
    const chain = readClient({ data: { value: { kind: 'rain' } }, error: null })
    await expect(readDailyInput('weather', '2026-09-24')).resolves.toEqual({ kind: 'rain' })
    expect(chain.eq).toHaveBeenCalledWith('kind', 'weather')
    expect(chain.eq).toHaveBeenCalledWith('date_kst', '2026-09-24')
  })

  it('행이 없으면 null이다', async () => {
    readClient({ data: null, error: null })
    await expect(readDailyInput('weather', '2026-09-24')).resolves.toBeNull()
  })

  it('조회 오류면 던지지 않고 null이다', async () => {
    readClient({ data: null, error: { message: '조회 실패' } })
    await expect(readDailyInput('special_days', '2026-09-24')).resolves.toBeNull()
  })

  it('클라이언트 생성이 던져도 null이다', async () => {
    createServiceClient.mockImplementation(() => {
      throw new Error('키 없음')
    })
    await expect(readDailyInput('weather', '2026-09-24')).resolves.toBeNull()
  })
})

describe('writeDailyInput', () => {
  it('(kind, date_kst) 충돌 키로 upsert한다', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    createServiceClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) })
    await writeDailyInput('weather', '2026-09-24', { kind: 'clear' })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'weather', date_kst: '2026-09-24', value: { kind: 'clear' } }),
      { onConflict: 'kind,date_kst' }
    )
  })

  it('저장 오류면 kind를 담아 던진다', async () => {
    const upsert = vi.fn(async () => ({ error: { message: '권한 없음' } }))
    createServiceClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) })
    await expect(writeDailyInput('special_days', '2026-09-24', [])).rejects.toThrow('special_days')
  })
})
