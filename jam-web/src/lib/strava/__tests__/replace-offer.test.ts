/**
 * «그래도 연결하기» 제안 쿠키 — 봉인과 개봉 (티켓 20261021_1249 4회)
 *
 * 실제 `encrypt`/`decrypt`와 HMAC을 그대로 쓴다(가짜 암호화로는 변조 탐지를 증명할 수 없다). 외부 서비스는 부르지 않는다.
 *
 * 고정하는 것: 봉인한 내용이 그대로 열린다 · 쿠키 값에 토큰·유저 id 평문이 없다 · 10분(경계 포함) 안에서만 열린다 ·
 * 값이 없으면 missing · 암호문·서명의 한 글자만 바뀌어도, 서명이 없거나 짧아도, 다른 키로 만든 것도 tampered ·
 * 서명이 맞아도 내용의 모양이 계약과 다르면 tampered · 서명 키가 없으면 던진다 · 쿠키 속성.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/replace-offer.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  STRAVA_REPLACE_OFFER_COOKIE,
  STRAVA_REPLACE_OFFER_MAX_AGE_SECONDS,
  getStravaReplaceOfferCookieOptions,
  openStravaReplaceOffer,
  sealStravaReplaceOffer,
} from '../replace-offer'

const KEY_A = 'ab'.repeat(32)
const KEY_B = 'cd'.repeat(32)
const NOW = 1_800_000_000_000

const INPUT = {
  userId: '11111111-1111-4111-8111-111111111111',
  athleteId: 424242,
  accessToken: 'ACCESS-TOKEN-SECRET',
  refreshToken: 'REFRESH-TOKEN-SECRET',
  tokenExpiresAtSec: 1_800_021_600,
}

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', KEY_A)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** 한 글자를 바꾼다(같은 16진수 알파벳 안에서) */
function flipAt(value: string, index: number): string {
  const ch = value[index]
  const next = ch === '0' ? '1' : '0'
  return value.slice(0, index) + next + value.slice(index + 1)
}

describe('sealStravaReplaceOffer / openStravaReplaceOffer', () => {
  it('봉인한 내용이 그대로 열리고 닫힐 시각은 봉인 시각 + 10분이다', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)
    const result = await openStravaReplaceOffer(sealed, NOW + 1000)

    expect(result).toEqual({
      ok: true,
      offer: { ...INPUT, expiresAtMs: NOW + STRAVA_REPLACE_OFFER_MAX_AGE_SECONDS * 1000 },
    })
  })

  it('쿠키 값에 토큰·유저 id·Strava 계정 번호의 평문이 없다', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)

    expect(sealed).not.toContain('ACCESS-TOKEN-SECRET')
    expect(sealed).not.toContain('REFRESH-TOKEN-SECRET')
    expect(sealed).not.toContain(INPUT.userId)
    expect(sealed).not.toContain('424242')
    // 같은 내용을 두 번 봉인해도 값이 다르다(무작위 iv)
    expect(await sealStravaReplaceOffer(INPUT, NOW)).not.toBe(sealed)
  })

  it('쿠키 값은 4KB 쿠키 한도 안이다', async () => {
    expect((await sealStravaReplaceOffer(INPUT, NOW)).length).toBeLessThan(1000)
  })

  it('닫힐 시각 1ms 전까지는 열리고, 그 시각부터는 expired다', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)
    const closeAt = NOW + STRAVA_REPLACE_OFFER_MAX_AGE_SECONDS * 1000

    expect((await openStravaReplaceOffer(sealed, closeAt - 1)).ok).toBe(true)
    expect(await openStravaReplaceOffer(sealed, closeAt)).toEqual({ ok: false, reason: 'expired' })
    expect(await openStravaReplaceOffer(sealed, closeAt + 60_000)).toEqual({ ok: false, reason: 'expired' })
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['빈 문자열', ''],
  ])('값이 %s이면 missing이다', async (_label, value) => {
    expect(await openStravaReplaceOffer(value, NOW)).toEqual({ ok: false, reason: 'missing' })
  })

  it('암호문의 한 글자가 바뀌면 tampered다', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)
    const dot = sealed.lastIndexOf('.')
    // iv 구간(앞쪽), 암호문 구간(뒤쪽) 모두
    for (const index of [0, 5, 40, dot - 1]) {
      if (sealed[index] === ':') continue
      expect(await openStravaReplaceOffer(flipAt(sealed, index), NOW), `index ${index}`).toEqual({
        ok: false,
        reason: 'tampered',
      })
    }
  })

  it('서명의 한 글자가 바뀌거나 서명이 짧거나 없으면 tampered다', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)
    const dot = sealed.lastIndexOf('.')

    expect(await openStravaReplaceOffer(flipAt(sealed, dot + 1), NOW)).toEqual({ ok: false, reason: 'tampered' })
    expect(await openStravaReplaceOffer(flipAt(sealed, sealed.length - 1), NOW)).toEqual({ ok: false, reason: 'tampered' })
    expect(await openStravaReplaceOffer(sealed.slice(0, sealed.length - 4), NOW)).toEqual({ ok: false, reason: 'tampered' })
    expect(await openStravaReplaceOffer(sealed.slice(0, dot), NOW)).toEqual({ ok: false, reason: 'tampered' })
    expect(await openStravaReplaceOffer(`${sealed.slice(0, dot)}.`, NOW)).toEqual({ ok: false, reason: 'tampered' })
    expect(await openStravaReplaceOffer('.abcdef', NOW)).toEqual({ ok: false, reason: 'tampered' })
    expect(await openStravaReplaceOffer('임의의 문자열', NOW)).toEqual({ ok: false, reason: 'tampered' })
  })

  it('다른 제안의 서명을 붙여도 tampered다', async () => {
    const first = await sealStravaReplaceOffer(INPUT, NOW)
    const second = await sealStravaReplaceOffer({ ...INPUT, athleteId: 999 }, NOW)
    const forged = `${first.slice(0, first.lastIndexOf('.'))}.${second.slice(second.lastIndexOf('.') + 1)}`

    expect(await openStravaReplaceOffer(forged, NOW)).toEqual({ ok: false, reason: 'tampered' })
  })

  it('다른 암호화 키로 만든 값은 tampered다(서명이 키에서 파생된다)', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)
    vi.stubEnv('ENCRYPTION_KEY', KEY_B)

    expect(await openStravaReplaceOffer(sealed, NOW)).toEqual({ ok: false, reason: 'tampered' })
  })

  it('서명이 맞아도 내용의 모양이 계약과 다르면 tampered다', async () => {
    const bad = [
      { ...INPUT, userId: '' },
      { ...INPUT, athleteId: 0 },
      { ...INPUT, athleteId: 1.5 },
      { ...INPUT, accessToken: '' },
      { ...INPUT, refreshToken: '' },
      { ...INPUT, tokenExpiresAtSec: Number.NaN },
      { ...INPUT, athleteId: '424242' as unknown as number },
    ]
    for (const input of bad) {
      const sealed = await sealStravaReplaceOffer(input, NOW)
      expect(await openStravaReplaceOffer(sealed, NOW), JSON.stringify(Object.keys(input))).toEqual({
        ok: false,
        reason: 'tampered',
      })
    }
  })

  it('암호화 키가 없으면 봉인도 개봉도 던진다(서버 설정 오류를 변조로 숨기지 않는다)', async () => {
    const sealed = await sealStravaReplaceOffer(INPUT, NOW)
    vi.stubEnv('ENCRYPTION_KEY', '')

    await expect(sealStravaReplaceOffer(INPUT, NOW)).rejects.toThrow()
    await expect(openStravaReplaceOffer(sealed, NOW)).rejects.toThrow()
  })
})

describe('getStravaReplaceOfferCookieOptions', () => {
  it('httpOnly, lax, /api/strava, 600초이고 secure는 운영에서만 켠다', () => {
    expect(STRAVA_REPLACE_OFFER_COOKIE).toBe('strava_replace_offer')
    expect(getStravaReplaceOfferCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/strava',
      maxAge: 600,
      secure: false,
    })
    vi.stubEnv('NODE_ENV', 'production')
    expect(getStravaReplaceOfferCookieOptions().secure).toBe(true)
  })
})
