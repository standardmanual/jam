/**
 * «그래도 연결하기» 제안 쿠키 (티켓 20261021_1249 4회, 운영 로직 3.2절)
 *
 * 콜백이 «이미 다른 JAM! 계정에 연결된 Strava 계정»을 만나면 방금 받은 토큰을 버리지 않고 10분간 이 쿠키에 담아 두었다가,
 * 유저가 안내 시트에서 «그래도 연결하기»를 눌렀을 때 `POST /api/strava/replace`가 꺼내 쓴다. 서버 표를 만들지 않으려는 선택이다
 * (표를 만들면 DB 변경과 만료 파기가 따라온다).
 *
 * 봉인: 내용(JSON)을 기존 `encrypt`(AES-256-CBC)로 암호화한 뒤, 암호문에 HMAC-SHA256을 붙인다(암호화한 뒤 서명). AES-CBC는 변조를
 * 알아채지 못하므로 서명이 변조 탐지를 맡는다. 서명 키는 `ENCRYPTION_KEY`에서 용도 문자열로 파생한다 — 새 환경변수가 없고, 이 키로
 * 다른 용도의 서명을 만들 때도 같은 키가 겹쳐 쓰이지 않는다. 개봉은 서명을 상수 시간으로 비교한 뒤에 복호화한다.
 *
 * 쿠키 값 모양: `{iv}:{암호문}.{서명}`(모두 소문자 16진수). 토큰은 평문으로 어디에도 남지 않는다. 토큰·쿠키 값은 로그에 남기지 않는다.
 *
 * 이 파일은 서버 전용이다(`node:crypto`, `encrypt`/`decrypt`). 클라이언트 컴포넌트에서 가져오지 않는다.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { decrypt, encrypt } from '@/lib/utils'

export const STRAVA_REPLACE_OFFER_COOKIE = 'strava_replace_offer'
export const STRAVA_REPLACE_OFFER_MAX_AGE_SECONDS = 600

/** 서명 키를 파생할 때 쓰는 용도 문자열. 바꾸면 이미 구운 쿠키가 모두 무효가 된다 */
const MAC_PURPOSE = 'jam:strava-replace-offer:v1'

/**
 * 쿠키 속성. `strava_oauth_state`와 같다: `sameSite: 'lax'`(Strava에서 돌아오는 최상위 이동에 실려야 하고 다른 사이트의 POST에는
 * 실리지 않는다), `path: '/api/strava'`(시트가 부르는 `/api/strava/replace`에 실린다), `secure`는 운영에서만.
 */
export function getStravaReplaceOfferCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/strava',
    maxAge: STRAVA_REPLACE_OFFER_MAX_AGE_SECONDS,
  }
}

/** 제안에 담는 내용 */
export interface StravaReplaceOffer {
  /** 콜백을 마친 로그인 유저. 새로 연결할 계정이다 */
  userId: string
  /** 연결하려는 Strava 계정(athlete) */
  athleteId: number
  /** 방금 Strava가 준 토큰(평문). 쿠키에서는 암호화돼 있다 */
  accessToken: string
  refreshToken: string
  /** Strava가 알려 준 access token 만료 시각(epoch 초) */
  tokenExpiresAtSec: number
  /** 이 제안이 닫히는 시각(epoch ms) */
  expiresAtMs: number
}

export type OpenStravaReplaceOfferResult =
  | { ok: true; offer: StravaReplaceOffer }
  | { ok: false; reason: 'missing' | 'tampered' | 'expired' }

function macKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) throw new Error('ENCRYPTION_KEY가 없어 제안 쿠키에 서명할 수 없습니다.')
  return createHmac('sha256', Buffer.from(hex, 'hex')).update(MAC_PURPOSE).digest()
}

function sign(encrypted: string): string {
  return createHmac('sha256', macKey()).update(encrypted).digest('hex')
}

/** 두 문자열이 같은지 상수 시간으로 본다. 길이가 다르면 바로 거절한다(서명은 길이가 고정이라 길이는 비밀이 아니다) */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

/** 쿠키에 넣을 값을 만든다. 암호화 키가 없거나 암호화가 실패하면 던진다 */
export async function sealStravaReplaceOffer(
  input: Omit<StravaReplaceOffer, 'expiresAtMs'>,
  now: number = Date.now()
): Promise<string> {
  const offer: StravaReplaceOffer = { ...input, expiresAtMs: now + STRAVA_REPLACE_OFFER_MAX_AGE_SECONDS * 1000 }
  const encrypted = await encrypt(JSON.stringify(offer))
  return `${encrypted}.${sign(encrypted)}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function readOffer(raw: unknown): StravaReplaceOffer | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (
    !isNonEmptyString(o.userId) ||
    typeof o.athleteId !== 'number' ||
    !Number.isInteger(o.athleteId) ||
    o.athleteId <= 0 ||
    !isNonEmptyString(o.accessToken) ||
    !isNonEmptyString(o.refreshToken) ||
    typeof o.tokenExpiresAtSec !== 'number' ||
    !Number.isFinite(o.tokenExpiresAtSec) ||
    typeof o.expiresAtMs !== 'number' ||
    !Number.isFinite(o.expiresAtMs)
  ) {
    return null
  }
  return {
    userId: o.userId,
    athleteId: o.athleteId,
    accessToken: o.accessToken,
    refreshToken: o.refreshToken,
    tokenExpiresAtSec: o.tokenExpiresAtSec,
    expiresAtMs: o.expiresAtMs,
  }
}

/**
 * 쿠키 값을 연다. 값이 없으면 `missing`, 서명이 맞지 않거나 복호화·해석에 실패하거나 내용의 모양이 계약과 다르면 `tampered`,
 * 서명이 맞지만 닫힐 시각이 지났으면 `expired`다. 서명 키가 없으면(서버 설정 오류) 던진다.
 */
export async function openStravaReplaceOffer(
  value: string | null | undefined,
  now: number = Date.now()
): Promise<OpenStravaReplaceOfferResult> {
  if (!value) return { ok: false, reason: 'missing' }

  const dot = value.lastIndexOf('.')
  if (dot <= 0 || dot === value.length - 1) return { ok: false, reason: 'tampered' }
  const encrypted = value.slice(0, dot)
  const mac = value.slice(dot + 1)
  if (!safeEqual(mac, sign(encrypted))) return { ok: false, reason: 'tampered' }

  let offer: StravaReplaceOffer | null
  try {
    offer = readOffer(JSON.parse(await decrypt(encrypted)))
  } catch {
    return { ok: false, reason: 'tampered' }
  }
  if (!offer) return { ok: false, reason: 'tampered' }
  if (now >= offer.expiresAtMs) return { ok: false, reason: 'expired' }
  return { ok: true, offer }
}
