import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, requireAdmin } from '@/lib/admin/auth'
import { isOverrideHex, normalizeOverrides } from '@/lib/today/feedColorOverrides'
import { fetchFeedColorOverrides } from '@/lib/today/feedColorOverridesRead'
import { invalidateFeedColors } from '@/lib/today/feedColorOverridesServer'
import { FEED_COLOR_KEYS, FEED_COLORS, type FeedColorKey } from '@/lib/today/feedConstants'

/**
 * 홈피드 컬러셋(색 9개의 hex 덮어쓰기) 읽기·저장 — 티켓 20261121_2146 (상위 20261120_2026 후속).
 *
 * - `GET`: 저장된 덮어쓰기와 기본값을 돌려준다.
 * - `PUT`: 본문 `{ overrides: { <색 키>: '#rrggbb' | null } }`. 값이 hex면 저장(upsert)하고 `null`이면 그 키의 행을 지운다(기본값 복원).
 *   모르는 키·잘못된 hex는 400이고 아무것도 저장하지 않는다. 저장 뒤 캐시 태그 `feed-colors`를 무효화해 홈이 바로 새 색을 읽는다.
 * 어드민 세션(`requireAdmin`)만 통과한다. 쓰기는 서비스 클라이언트로 하고 `updated_by`에 관리자 id를 남긴다.
 */

/** 본문 글자 수 한도. 9키 × 키·hex 글자가 들어가고도 넉넉한 값이다(그보다 크면 키 개수 검사 전에 거절한다). */
const MAX_BODY_CHARS = 2048

const defaultHexes = (): Record<FeedColorKey, string> =>
  Object.fromEntries(FEED_COLOR_KEYS.map((key) => [key, FEED_COLORS[key].hex.toLowerCase()])) as Record<FeedColorKey, string>

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 })

const isFeedColorKey = (value: string): value is FeedColorKey => (FEED_COLOR_KEYS as readonly string[]).includes(value)

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const overrides = await fetchFeedColorOverrides(createServiceClient(), '[어드민 홈피드 컬러셋 조회 오류]')
  return NextResponse.json({ overrides, defaults: defaultHexes() })
}

export async function PUT(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const raw = await req.text()
  if (raw.length > MAX_BODY_CHARS) {
    return badRequest('요청 내용이 너무 길어요. 색 9개 이하로 줄여서 다시 저장해 주세요.')
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return badRequest('요청 내용을 읽지 못했어요. 화면을 새로고침한 뒤 다시 저장해 주세요.')
  }
  const overrides = (body as { overrides?: unknown } | null)?.overrides
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    return badRequest('저장할 색이 없어요. 바꿀 색을 고른 뒤 다시 저장해 주세요.')
  }

  const entries = Object.entries(overrides as Record<string, unknown>)
  if (entries.length === 0) return badRequest('저장할 색이 없어요. 바꿀 색을 고른 뒤 다시 저장해 주세요.')
  if (entries.length > FEED_COLOR_KEYS.length) {
    return badRequest(`색은 한 번에 ${FEED_COLOR_KEYS.length}개까지만 저장할 수 있어요. 개수를 줄여서 다시 저장해 주세요.`)
  }

  const unknownKeys = entries.map(([key]) => key).filter((key) => !isFeedColorKey(key))
  if (unknownKeys.length > 0) {
    return badRequest(`모르는 색 이름(${unknownKeys.join(', ')})이 있어요. 화면을 새로고침한 뒤 다시 저장해 주세요.`)
  }

  const toDelete: FeedColorKey[] = []
  const hexInput: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    if (value === null) toDelete.push(key as FeedColorKey)
    else hexInput[key] = value
  }
  const badHexKeys = Object.keys(hexInput).filter((key) => !isOverrideHex(hexInput[key]))
  if (badHexKeys.length > 0) {
    return badRequest(`색 값이 올바르지 않아요(${badHexKeys.join(', ')}). #과 영문·숫자 6자리(예: #ff9a9a)로 입력해 주세요.`)
  }

  const normalized = normalizeOverrides(hexInput)
  const admin = await getAdminUser()
  const updatedAt = new Date().toISOString()
  const rows = Object.entries(normalized).map(([color_key, hex]) => ({
    color_key,
    hex,
    updated_by: admin?.id ?? null,
    updated_at: updatedAt,
  }))

  const supabase = createServiceClient()
  let wrote = false
  try {
    if (rows.length > 0) {
      const { error } = await supabase.from('feed_color_overrides').upsert(rows, { onConflict: 'color_key' })
      if (error) throw error
      wrote = true
    }
    if (toDelete.length > 0) {
      const { error } = await supabase.from('feed_color_overrides').delete().in('color_key', toDelete)
      if (error) throw error
      wrote = true
    }
  } catch (err) {
    console.error('[어드민 홈피드 컬러셋 저장 오류]', err)
    // 일부만 저장됐을 수 있으니 쓴 것이 있으면 홈이 새로 읽게 한다
    if (wrote) invalidateFeedColors()
    return NextResponse.json({ error: '색을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 })
  }

  invalidateFeedColors()
  const saved = await fetchFeedColorOverrides(supabase, '[어드민 홈피드 컬러셋 조회 오류]')
  return NextResponse.json({ overrides: saved, defaults: defaultHexes() })
}
