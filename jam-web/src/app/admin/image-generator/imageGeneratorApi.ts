import type { Database } from '@/types/database.generated'

/** 티켓 20261113_1132 — 이미지 생성 화면이 쓰는 API 응답 형태와 호출 도우미 */

export type Preset = Database['public']['Tables']['badge_image_presets']['Row'] & { appliedCount: number }

export const STYLE_ID_PLACEHOLDER = 'SET_ME'
export const MODEL_OPTIONS = ['recraftv3', 'recraftv4', 'recraftv4_1'] as const

export interface Candidate {
  url: string
  touchesEdge: boolean
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

/** JSON API 호출. 실패하면 서버의 error 문구를 담은 ApiError를 던진다 */
export async function callApi<T>(url: string, init?: { method: 'POST' | 'PATCH'; body: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init ? { 'Content-Type': 'application/json' } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new ApiError(json?.error ?? '요청에 실패했어요.', res.status)
  return json as T
}

export function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })
}

/** 투명 PNG·WebP를 구분하기 쉽게 보이는 체크무늬 배경 */
export const CHECKER_STYLE = {
  backgroundImage:
    'linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
} as const
