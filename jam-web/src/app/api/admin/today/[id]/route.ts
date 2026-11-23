import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { imageSourceReset, imageUrlTypeError } from '@/lib/admin/imageSourceReset'
import { coverColorsFieldsIfChanged, type CoverColorsFields } from '@/lib/admin/coverColors'
import {
  createFeedSeed,
  decideFeedCardValues,
  hasFeedCardColumns,
  pickFeedCardColumns,
  validateFeedCardColumns,
  type FeedCardColumns,
} from '@/lib/admin/feedCardFields'
import { fetchFeedCardImageColors, fetchRecentBgKeys, serverRandomUint32 } from '@/lib/admin/feedCardServer'

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1602). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '카드 정보를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const SAVE_ERROR_MESSAGE = '카드를 저장하지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const DELETE_ERROR_MESSAGE = '카드를 삭제하지 못했어요. 서버에서 삭제 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
// 본문이 JSON `null`이면 아래 `body.` 접근이 던져 500이 된다(티켓 20260926_1601). 다른 어드민 라우트의 본문 오류 문구와 같다.
const INVALID_BODY_MESSAGE = '요청 형식이 올바르지 않습니다.'

/** 수정 저장이 저장된 카드에서 읽는 칸. 커버 이미지는 제작 경로 초기화, 나머지는 개편 칸 검증·자동 값 고정에 쓴다. */
const EXISTING_SELECT =
  'cover_image_url, title, item_book_id, starts_at, ends_at, feed_type, feed_seed, bg_color_key, chip_color_key, box_color_key, box_kind, cover_colors, badge_ids'
interface ExistingCard {
  cover_image_url: string | null
  title: string | null
  item_book_id: string | null
  starts_at: string | null
  ends_at: string | null
  feed_type: FeedCardColumns['feed_type']
  feed_seed: number | null
  bg_color_key: FeedCardColumns['bg_color_key']
  chip_color_key: FeedCardColumns['chip_color_key']
  box_color_key: FeedCardColumns['box_color_key']
  /** 아래 셋은 자동 색 배정의 이미지 규칙(티켓 20261121_1828)이 읽는다. */
  box_kind: FeedCardColumns['box_kind']
  cover_colors: unknown
  badge_ids: string[] | null
}

/** 커버 주소 비교용: 비어 있는 값(`null`·빈 글자·글자가 아님)은 모두 같다. 대표 색 헬퍼(`coverColors.ts`)의 «바뀌었나» 판정과 같은 기준이다. */
const urlKey = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

const COLOR_KEYS = ['bg_color_key', 'chip_color_key', 'box_color_key'] as const

/**
 * 개편 칸 검증과 자동 값 고정(수정 저장). 이미 저장된 값은 다시 정하지 않는다.
 * - 저장된 `feed_seed`가 있으면 본문이 다른 값을 보내도 바꾸지 않는다(`omit`).
 * - 예외 ①: 유형이 비어 있던 카드에 처음 유형을 지정하는데 시드가 없으면 시드와 비어 있는 색 키를 한 번 정한다.
 * - 예외 ②: 본문이 색 키를 `null`(자동)로 보내면 저장된 시드로 그 색만 다시 정한다.
 * 칩 자리·기울기와 컬렉션 모션 위치는 시드로 홈이 같은 값을 그리므로 저장하지 않는다.
 */
async function decideFeedColumnsForPatch(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  body: Record<string, unknown>,
  existing: ExistingCard,
  coverColorsPatch: CoverColorsFields,
): Promise<{ errors: string[]; warnings: string[]; patch: Record<string, unknown>; omit: string[] }> {
  const columns = pickFeedCardColumns(body)
  const title = typeof body.title === 'string' ? body.title : (existing.title ?? '')
  const itemBookId = 'item_book_id' in body ? (typeof body.item_book_id === 'string' ? body.item_book_id : null) : existing.item_book_id
  // 본문에 유형이 없으면 저장된 유형으로 검증한다(칩 자리·도장 자리는 유형이 정한다).
  const checked = validateFeedCardColumns({ feed_type: existing.feed_type, ...columns }, { title, itemBookId })
  const result = { errors: checked.errors, warnings: [...checked.warnings], patch: {} as Record<string, unknown>, omit: [] as string[] }
  if (checked.errors.length > 0) return result

  if (existing.feed_seed !== null && 'feed_seed' in body) result.omit.push('feed_seed')

  const finalType = 'feed_type' in body ? (body.feed_type ?? null) : existing.feed_type
  if (!finalType) return result

  const firstTime = existing.feed_type === null && existing.feed_seed === null
  const autoRequested = COLOR_KEYS.filter((key) => key in body && (body[key] === null || body[key] === ''))
  if (!firstTime && autoRequested.length === 0) return result

  const bodySeed = typeof body.feed_seed === 'number' ? body.feed_seed : null
  const seed = existing.feed_seed ?? bodySeed ?? createFeedSeed(serverRandomUint32)
  // 지정값: 본문이 값을 보냈으면 그 값, 본문에 없으면 저장된 값, 본문이 null이면 자동(다시 정한다)
  const fixed: Partial<Pick<FeedCardColumns, 'bg_color_key' | 'chip_color_key' | 'box_color_key'>> = {}
  for (const key of COLOR_KEYS) {
    const value = key in body ? body[key] : existing[key]
    fixed[key] = (value || null) as FeedCardColumns[typeof key]
  }
  const startsAt = typeof body.starts_at === 'string' ? body.starts_at : existing.starts_at
  const endsAt = typeof body.ends_at === 'string' ? body.ends_at : existing.ends_at
  // 이미지 대표 색(규칙 ⑤·⑥, 티켓 20261121_1828): 커버 색은 이 저장이 쓰는 값이다 — 커버가 바뀌었으면 새로 뽑은 값(추출 실패면 NULL, 낡은 값을 쓰지 않는다),
  // 안 바뀌었으면 저장된 값. 배지 색은 유형이 배지 그림을 쓸 때만 `badges`에서 한 번 읽는다(조회 실패는 이미지 규칙 없이 진행).
  const coverChanged = typeof body.cover_image_url !== 'undefined' && urlKey(existing.cover_image_url) !== urlKey(body.cover_image_url)
  const coverColors = coverColorsPatch.cover_colors ?? (coverChanged ? null : existing.cover_colors)
  const boxKind = 'box_kind' in body ? (typeof body.box_kind === 'string' ? body.box_kind : null) : existing.box_kind
  const image = await fetchFeedCardImageColors(
    supabase,
    {
      feedType: String(finalType),
      boxKind,
      coverColors,
      badgeIds: 'badge_ids' in body ? (Array.isArray(body.badge_ids) ? (body.badge_ids as string[]) : null) : existing.badge_ids,
      itemBookId,
    },
    '[today PATCH 배지 대표 색 조회 오류]',
  )
  const decided = decideFeedCardValues({
    columns: { ...fixed, feed_seed: seed, feed_type: String(finalType) as FeedCardColumns['feed_type'], box_kind: boxKind as FeedCardColumns['box_kind'] },
    seed,
    recentBgKeys: await fetchRecentBgKeys(supabase, { startsAt, endsAt, excludeId: id }, '[today PATCH 앞 카드 바탕 조회 오류]'),
    excludedPairs: [],
    image,
  })
  if (decided.imageRuleSkipped) console.warn(`[today PATCH 색 자동 배정] 이미지 규칙까지 통과하는 조합이 없어 이미지 규칙 없이 정했어요 (카드 ${id})`)

  // 처음 정하는 경우, 그리고 유형은 있는데 시드가 비어 있던 카드(색만 자동으로 되돌린 경우)는 쓴 시드를 저장해 홈이 같은 값을 그리게 한다.
  if (firstTime || existing.feed_seed === null) result.patch.feed_seed = decided.feed_seed
  for (const key of COLOR_KEYS) {
    if (firstTime || autoRequested.includes(key)) result.patch[key] = decided[key]
  }
  result.warnings.push(...decided.warnings)
  return result
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const body = await req.json()
  if (body === null) return NextResponse.json({ error: INVALID_BODY_MESSAGE }, { status: 400 })

  // 이 라우트의 이미지 컬럼은 `cover_image_url`이다(티켓 20260926_1455).
  const imageUrlError = imageUrlTypeError(body.cover_image_url)
  if (imageUrlError) return NextResponse.json({ error: imageUrlError }, { status: 400 })

  const supabase = createServiceClient()

  // 개편 칸(마이그레이션 349)이 본문에 있으면 저장된 카드와 합쳐 검증한다(티켓 20261121_1315). 없는 옛 본문은 이 단계를 건너뛰고 이전과 똑같이 저장한다.
  const touchesFeedColumns = hasFeedCardColumns(body)

  // 커버 이미지가 실제로 바뀔 때만 제작 경로를 NULL(미상)로 되돌린다(티켓 20260925_1940
  // 방침 A). 폼은 매번 전체 필드를 보내므로 기존 값과 비교하고, 본문에 cover_image_url이
  // 없고 개편 칸도 없으면 기존 행을 조회하지 않는다.
  let imageSourcePatch: { image_source?: null } = {}
  // 커버 대표 색도 같은 시점에 같은 쓰기에 담는다(티켓 20261121_1724). 추출이 실패하면 빈 조각이고, 주소만 바뀐 UPDATE는 DB 트리거가 낡은 색을 비운다.
  let coverColorsPatch: CoverColorsFields = {}
  let existing: ExistingCard | null = null
  if (body.cover_image_url !== undefined || touchesFeedColumns) {
    const { data: existingRow, error: existingError } = await supabase
      .from('today_cards')
      .select(EXISTING_SELECT)
      .eq('id', id)
      .maybeSingle<ExistingCard>()
    if (existingError) {
      console.error('[today PATCH 기존 카드 조회 오류]', existingError)
      return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
    }
    if (!existingRow) return NextResponse.json({ error: '카드를 찾을 수 없습니다.' }, { status: 404 })
    existing = existingRow
    if (body.cover_image_url !== undefined) {
      imageSourcePatch = imageSourceReset(existing.cover_image_url, body.cover_image_url)
      coverColorsPatch = await coverColorsFieldsIfChanged(existing.cover_image_url, body.cover_image_url)
    }
  }

  // 제작 경로(image_source)는 본문으로 바꿀 수 없다 — 이미지 변경 시 초기화(위)와 적용 탭·등록
  // 스크립트로만 바뀐다(티켓 20260925_2003 방침 A). 배지·컬렉션·미션 저장 라우트와 같은 규칙이다.
  const safeBody = { ...body }
  delete safeBody.image_source

  const warnings: string[] = []
  if (touchesFeedColumns && existing) {
    const decision = await decideFeedColumnsForPatch(supabase, id, safeBody, existing, coverColorsPatch)
    if (decision.errors.length > 0) {
      return NextResponse.json({ error: decision.errors.join(' '), errors: decision.errors }, { status: 400 })
    }
    Object.assign(safeBody, decision.patch)
    for (const key of decision.omit) delete safeBody[key]
    warnings.push(...decision.warnings)
  }

  const { data, error } = await supabase
    .from('today_cards')
    .update({ ...safeBody, ...imageSourcePatch, ...coverColorsPatch } as never)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[today PATCH 저장 오류]', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }
  return NextResponse.json(warnings.length > 0 ? { ...data, warnings } : data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('today_cards').delete().eq('id', id)
  if (error) {
    console.error('[today DELETE 삭제 오류]', error)
    return NextResponse.json({ error: DELETE_ERROR_MESSAGE }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
