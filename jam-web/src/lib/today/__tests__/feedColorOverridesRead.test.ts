/**
 * 색 덮어쓰기 표 읽기 (티켓 20261121_2145)
 *
 * 확인하는 것: 행을 정리해 읽기, 표가 비었거나 읽기가 실패(오류·예외)해도 기본값으로 돌려주고 서버 로그에 남기기.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedColorOverridesRead.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFeedColorOverrides, fetchFeedPalette } from '../feedColorOverridesRead'
import { DEFAULT_FEED_PALETTE } from '../feedAssign'
import { FakeDb } from '@/lib/admin/opsInbox/execute/__tests__/fakeDb'

const LOG_LABEL = '[시험 로그 머리말]'
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

describe('fetchFeedColorOverrides', () => {
  it('행이 없으면 빈 덮어쓰기고 기본 팔레트다(로그 없음)', async () => {
    const db = new FakeDb()
    expect(await fetchFeedColorOverrides(db.service)).toEqual({})
    expect(await fetchFeedPalette(db.service)).toEqual(DEFAULT_FEED_PALETTE)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('행을 읽어 정리한다(모르는 키·잘못된 hex는 버리고 hex는 소문자로)', async () => {
    const db = new FakeDb()
    db.tables.feed_color_overrides = [
      { color_key: 'red', hex: '#AA0000' },
      { color_key: 'nope', hex: '#00ff00' },
      { color_key: 'blue', hex: 'bad' },
    ]
    expect(await fetchFeedColorOverrides(db.service)).toEqual({ red: '#aa0000' })
    expect((await fetchFeedPalette(db.service)).red).toBe('#aa0000')
    expect(db.calls.every((call) => call.table === 'feed_color_overrides' && call.op === 'select')).toBe(true)
  })

  it('조회가 오류를 돌려주면 기본값이고 로그 머리말과 함께 서버 로그에 남긴다', async () => {
    const db = new FakeDb()
    db.tables.feed_color_overrides = [{ color_key: 'red', hex: '#aa0000' }]
    db.failIf = () => true
    expect(await fetchFeedColorOverrides(db.service, LOG_LABEL)).toEqual({})
    expect(await fetchFeedPalette(db.service, LOG_LABEL)).toEqual(DEFAULT_FEED_PALETTE)
    expect(errorSpy.mock.calls[0][0]).toBe(LOG_LABEL)
  })

  it('조회가 던져도(표 없음 등) 던지지 않고 기본값이다', async () => {
    const client = {
      from: () => {
        throw new Error('relation "feed_color_overrides" does not exist')
      },
    }
    const result = await fetchFeedColorOverrides(client as never, LOG_LABEL)
    expect(result).toEqual({})
    expect(errorSpy.mock.calls[0][0]).toBe(LOG_LABEL)
  })
})
