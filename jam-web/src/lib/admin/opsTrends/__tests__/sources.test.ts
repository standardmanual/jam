/**
 * 트렌드 출처 등록·수정 본문 검증 (티켓 20261026_2033 1회차)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsTrends/__tests__/sources.test.ts
 */
import { describe, it, expect } from 'vitest'
import { validateTrendSourceCreate, validateTrendSourcePatch } from '../sources'
import { OPS_TREND_SOURCE_MAX_LOCATION, OPS_TREND_SOURCE_MAX_NAME } from '../constants'

describe('validateTrendSourceCreate', () => {
  it('앞뒤 공백을 떼고 통과시킨다', () => {
    const result = validateTrendSourceCreate({ name: '  러닝 해시태그 ', kind: 'hashtag', location: ' #러닝 ' })
    expect(result).toEqual({ ok: true, value: { name: '러닝 해시태그', kind: 'hashtag', location: '#러닝' } })
  })

  it.each(['hashtag', 'channel', 'search_trend'] as const)('%s는 location이 비면 오류', (kind) => {
    const result = validateTrendSourceCreate({ name: '출처', kind, location: '  ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('location')
  })

  it('location 칸이 없어도 직접 올린 자료는 통과하고 빈 문자열이 된다', () => {
    const result = validateTrendSourceCreate({ name: '직접 올린 자료', kind: 'manual_upload' })
    expect(result).toEqual({ ok: true, value: { name: '직접 올린 자료', kind: 'manual_upload', location: '' } })
  })

  it('이름이 비거나 60자를 넘으면 오류', () => {
    expect(validateTrendSourceCreate({ name: '   ', kind: 'channel', location: 'x' }).ok).toBe(false)
    const long = 'a'.repeat(OPS_TREND_SOURCE_MAX_NAME + 1)
    expect(validateTrendSourceCreate({ name: long, kind: 'channel', location: 'x' }).ok).toBe(false)
    const edge = 'a'.repeat(OPS_TREND_SOURCE_MAX_NAME)
    expect(validateTrendSourceCreate({ name: edge, kind: 'channel', location: 'x' }).ok).toBe(true)
  })

  it('location이 300자를 넘으면 오류이고 「필수」 오류는 겹쳐 내지 않는다', () => {
    const result = validateTrendSourceCreate({
      name: '출처',
      kind: 'channel',
      location: 'a'.repeat(OPS_TREND_SOURCE_MAX_LOCATION + 1),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(1)
  })

  it('알 수 없는 종류·문자열이 아닌 값·줄바꿈은 오류', () => {
    expect(validateTrendSourceCreate({ name: 'a', kind: 'rss', location: 'x' }).ok).toBe(false)
    expect(validateTrendSourceCreate({ name: 1, kind: 'channel', location: 'x' }).ok).toBe(false)
    expect(validateTrendSourceCreate({ name: 'a', kind: 'channel', location: 5 }).ok).toBe(false)
    expect(validateTrendSourceCreate({ name: 'a\nb', kind: 'channel', location: 'x' }).ok).toBe(false)
  })

  it('객체가 아니면 오류, 여러 오류는 한꺼번에 담는다', () => {
    expect(validateTrendSourceCreate(null).ok).toBe(false)
    expect(validateTrendSourceCreate([]).ok).toBe(false)
    const result = validateTrendSourceCreate({ name: '', kind: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(2)
  })
})

describe('validateTrendSourcePatch', () => {
  it('enabled만 보내도 통과한다', () => {
    expect(validateTrendSourcePatch({ enabled: false })).toEqual({ ok: true, value: { enabled: false } })
  })

  it('name·location은 앞뒤 공백을 뗀다', () => {
    expect(validateTrendSourcePatch({ name: ' 새 이름 ', location: ' #a ' })).toEqual({
      ok: true,
      value: { name: '새 이름', location: '#a' },
    })
  })

  it('location을 빈 문자열로 보내는 것은 검증 단계에서는 통과한다(종류 확인은 저장소)', () => {
    expect(validateTrendSourcePatch({ location: '' })).toEqual({ ok: true, value: { location: '' } })
  })

  it('아무 칸도 없으면 오류', () => {
    expect(validateTrendSourcePatch({}).ok).toBe(false)
    expect(validateTrendSourcePatch({ kind: 'channel' }).ok).toBe(false)
  })

  it('enabled가 불리언이 아니거나 이름이 틀리면 오류', () => {
    expect(validateTrendSourcePatch({ enabled: 'yes' }).ok).toBe(false)
    expect(validateTrendSourcePatch({ name: '' }).ok).toBe(false)
    expect(validateTrendSourcePatch({ name: 'a'.repeat(OPS_TREND_SOURCE_MAX_NAME + 1) }).ok).toBe(false)
    expect(validateTrendSourcePatch('x').ok).toBe(false)
  })
})
