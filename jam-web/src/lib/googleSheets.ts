/**
 * Google Sheets 읽기 전용 클라이언트 (서비스 계정 JWT 인증).
 *
 * `googleapis` 패키지를 새로 추가하지 않는다 — Node 내장 `crypto`로 RS256 JWT를
 * 직접 서명해 OAuth 2.0 서버 대 서버 흐름(RFC 7523)을 구현한다. 필요한 건 액세스
 * 토큰 발급 1개 요청 + Sheets API 값 조회 1개 요청뿐이라 패키지 도입 대비 부담이
 * 훨씬 작다 (VOC CS 게시판, 티켓 20260828_1921).
 *
 * 인증 정보는 `GOOGLE_SHEETS_CLIENT_EMAIL` / `GOOGLE_SHEETS_PRIVATE_KEY` 환경변수로
 * 관리한다(.env.local + Vercel). 캐시하지 않는다 — 매 호출 fresh fetch가 요구사항.
 */
import { createSign } from 'crypto'

interface ServiceAccountCreds {
  email: string
  privateKey: string
}

function getCreds(): ServiceAccountCreds {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const rawPrivateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY
  if (!email || !rawPrivateKey) {
    throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY 환경변수가 설정되지 않았습니다.')
  }
  // Vercel 환경변수는 개행이 `\n` 리터럴 문자열로 저장되는 경우가 흔해 실제 개행으로 복원한다.
  return { email, privateKey: rawPrivateKey.replace(/\\n/g, '\n') }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function fetchAccessToken(): Promise<string> {
  const { email, privateKey } = getCreds()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = base64url(signer.sign(privateKey))
  const jwt = `${unsigned}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Google OAuth 토큰 발급 실패 (status ${res.status})`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error('Google OAuth 응답에 access_token이 없습니다.')
  }
  return data.access_token
}

/**
 * 지정 스프레드시트/범위의 값을 2차원 문자열 배열로 가져온다.
 * 캐시 없이 매 호출 Google Sheets API를 직접 조회한다("새로고침 시 반영" 요구사항).
 */
export async function fetchSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const accessToken = await fetchAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Google Sheets 값 조회 실패 (status ${res.status})`)
  }
  const data = (await res.json()) as { values?: string[][] }
  return data.values ?? []
}
