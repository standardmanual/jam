/**
 * 개발 요청 본문 검증 (티켓 20261026_2027 1회차)
 *
 * 지키는 것:
 * - 생성: 제목·출처 필수, 앞뒤 공백 제거, 길이 상한(제목 80·내용 2000·정책 ID 100), 허용 출처, 제어 문자 거부
 * - 수정: status는 requested·dismissed만(ticketed·ticketId 거부), 비어 있으면 오류
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devRequests/__tests__/requests.test.ts
 */
import { describe, it, expect } from 'vitest'
import { validateDevRequestCreate, validateDevRequestPatch } from '../requests'

describe('validateDevRequestCreate', () => {
  it('제목·출처만 있어도 통과하고 내용은 빈 문자열, 정책은 null이다', () => {
    const result = validateDevRequestCreate({ title: '  캡슐 확률을 코드 밖으로  ', origin: 'eco' })
    expect(result).toEqual({
      ok: true,
      value: { title: '캡슐 확률을 코드 밖으로', detail: '', origin: 'eco', policyId: null },
    })
  })

  it('내용·정책 ID의 앞뒤 공백을 제거하고, 빈 정책 ID는 null이다', () => {
    const full = validateDevRequestCreate({ title: 't', detail: ' 내용\n둘째 줄 ', origin: 'ops', policyId: ' ch19-kpi-1 ' })
    expect(full).toEqual({ ok: true, value: { title: 't', detail: '내용\n둘째 줄', origin: 'ops', policyId: 'ch19-kpi-1' } })
    const blank = validateDevRequestCreate({ title: 't', origin: 'other', policyId: '   ' })
    expect(blank.ok && blank.value.policyId).toBeNull()
  })

  it('객체가 아니면 거부한다', () => {
    for (const raw of [null, 'x', 1, [], undefined]) {
      expect(validateDevRequestCreate(raw).ok).toBe(false)
    }
  })

  it('제목이 비었거나 공백뿐이거나 문자열이 아니면 거부한다', () => {
    for (const title of ['', '   ', 5, undefined]) {
      const result = validateDevRequestCreate({ title, origin: 'ops' })
      expect(result.ok).toBe(false)
    }
  })

  it('제목은 80자까지, 81자는 거부한다', () => {
    expect(validateDevRequestCreate({ title: 'a'.repeat(80), origin: 'ops' }).ok).toBe(true)
    expect(validateDevRequestCreate({ title: 'a'.repeat(81), origin: 'ops' }).ok).toBe(false)
  })

  it('제목의 줄바꿈·제어 문자는 거부한다', () => {
    expect(validateDevRequestCreate({ title: '가\n나', origin: 'ops' }).ok).toBe(false)
    expect(validateDevRequestCreate({ title: '가\u0000나', origin: 'ops' }).ok).toBe(false)
  })

  it('내용은 2000자까지이고 줄바꿈은 허용하며 그 밖의 제어 문자는 거부한다', () => {
    expect(validateDevRequestCreate({ title: 't', detail: 'a'.repeat(2000), origin: 'ops' }).ok).toBe(true)
    expect(validateDevRequestCreate({ title: 't', detail: 'a'.repeat(2001), origin: 'ops' }).ok).toBe(false)
    expect(validateDevRequestCreate({ title: 't', detail: '가\n나\t다', origin: 'ops' }).ok).toBe(true)
    expect(validateDevRequestCreate({ title: 't', detail: '가\u0007나', origin: 'ops' }).ok).toBe(false)
    expect(validateDevRequestCreate({ title: 't', detail: 3, origin: 'ops' }).ok).toBe(false)
  })

  it('정책 ID는 100자까지이고 줄바꿈을 거부한다', () => {
    expect(validateDevRequestCreate({ title: 't', origin: 'eco', policyId: 'p'.repeat(100) }).ok).toBe(true)
    expect(validateDevRequestCreate({ title: 't', origin: 'eco', policyId: 'p'.repeat(101) }).ok).toBe(false)
    expect(validateDevRequestCreate({ title: 't', origin: 'eco', policyId: 'a\nb' }).ok).toBe(false)
    expect(validateDevRequestCreate({ title: 't', origin: 'eco', policyId: 7 }).ok).toBe(false)
  })

  it('출처는 ops·eco·other만 받는다', () => {
    for (const origin of ['ops', 'eco', 'other']) {
      expect(validateDevRequestCreate({ title: 't', origin }).ok).toBe(true)
    }
    for (const origin of ['', 'admin', undefined, 1]) {
      expect(validateDevRequestCreate({ title: 't', origin }).ok).toBe(false)
    }
  })

  it('틀린 칸마다 오류를 모은다', () => {
    const result = validateDevRequestCreate({ title: '', origin: 'x', detail: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(3)
  })
})

describe('validateDevRequestPatch', () => {
  it('requested·dismissed를 받는다', () => {
    expect(validateDevRequestPatch({ status: 'dismissed' })).toEqual({ ok: true, value: { status: 'dismissed' } })
    expect(validateDevRequestPatch({ status: 'requested' })).toEqual({ ok: true, value: { status: 'requested' } })
  })

  it('ticketed와 그 밖의 값은 거부한다', () => {
    expect(validateDevRequestPatch({ status: 'ticketed' }).ok).toBe(false)
    expect(validateDevRequestPatch({ status: 'done' }).ok).toBe(false)
    expect(validateDevRequestPatch({ status: 1 }).ok).toBe(false)
  })

  it('ticketId는 받지 않는다(보내도 무시되고, status 없이는 거부)', () => {
    expect(validateDevRequestPatch({ ticketId: '20261026_2027' }).ok).toBe(false)
    expect(validateDevRequestPatch({ status: 'dismissed', ticketId: 'x' })).toEqual({
      ok: true,
      value: { status: 'dismissed' },
    })
  })

  it('비었거나 객체가 아니면 거부한다', () => {
    expect(validateDevRequestPatch({}).ok).toBe(false)
    expect(validateDevRequestPatch(null).ok).toBe(false)
    expect(validateDevRequestPatch([]).ok).toBe(false)
  })
})
