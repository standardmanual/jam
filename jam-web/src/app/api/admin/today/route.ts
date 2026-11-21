import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, getAdminUser } from '@/lib/admin/auth'
import {
  countBgUsage,
  createFeedSeed,
  decideFeedCardValues,
  hasFeedCardColumns,
  pickFeedCardColumns,
  validateFeedCardColumns,
  type FeedCardColumns,
} from '@/lib/admin/feedCardFields'

export async function GET() {
  const authError = await requireAdmin()
  if (authError) return authError

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('today_cards')
    .select('*')
    .order('starts_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** 서버 난수(0 이상 2^32 미만 정수). 시험할 수 있도록 `createFeedSeed`가 공급 함수로 받는다. */
function serverRandomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/**
 * 같은 시기에 노출되는 카드의 배경색 사용 빈도. 게시 기간(`starts_at`~`ends_at`)이 겹치고 `bg_color_key`가 있는 카드를 센다.
 * 기간이 비어 있거나 조회가 실패하면 빈 빈도로 정한다(빈도는 배경색을 고르게 퍼뜨리는 보조 입력이라 저장을 막지 않는다).
 */
async function overlappingBgUsage(
  supabase: ReturnType<typeof createServiceClient>,
  startsAt: unknown,
  endsAt: unknown,
): Promise<Record<string, number>> {
  if (typeof startsAt !== 'string' || typeof endsAt !== 'string') return {}
  const { data, error } = await supabase
    .from('today_cards')
    .select('bg_color_key')
    .lte('starts_at', endsAt)
    .gte('ends_at', startsAt)
    .not('bg_color_key', 'is', null)
  if (error) {
    console.error('[today POST 배경색 사용 빈도 조회 오류]', error)
    return {}
  }
  return countBgUsage((data ?? []) as Array<{ bg_color_key: string | null }>)
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const admin = await getAdminUser()
  const body = await req.json()
  const supabase = createServiceClient()

  // 제작 경로(image_source)는 본문으로 정할 수 없다 — 생성 시점은 NULL(미상)이고 적용 탭·등록
  // 스크립트가 이후에 채운다(티켓 20260925_2023 방침 A). 수정 라우트(2003)와 같은 규칙이다.
  const safeBody = { ...body }
  delete safeBody.image_source

  // 개편 칸(마이그레이션 349)이 본문에 있으면 검증하고, 유형이 있는 새 카드는 비어 있는 시드·색 키를 정해 고정한다(티켓 20261121_1315).
  // 개편 칸이 없는 옛 본문은 이전과 똑같이 그대로 저장한다.
  const warnings: string[] = []
  if (hasFeedCardColumns(safeBody)) {
    const columns = pickFeedCardColumns(safeBody)
    const checked = validateFeedCardColumns(columns, {
      title: typeof safeBody.title === 'string' ? safeBody.title : '',
      itemBookId: typeof safeBody.item_book_id === 'string' ? safeBody.item_book_id : null,
    })
    if (checked.errors.length > 0) {
      return NextResponse.json({ error: checked.errors.join(' '), errors: checked.errors }, { status: 400 })
    }
    warnings.push(...checked.warnings)

    if (columns.feed_type) {
      const usage = await overlappingBgUsage(supabase, safeBody.starts_at, safeBody.ends_at)
      const decided = decideFeedCardValues({
        columns: columns as Partial<FeedCardColumns>,
        seed: createFeedSeed(serverRandomUint32),
        overlappingBgUsage: usage,
        excludedPairs: [],
      })
      safeBody.feed_seed = decided.feed_seed
      safeBody.bg_color_key = decided.bg_color_key
      safeBody.chip_color_key = decided.chip_color_key
      safeBody.box_color_key = decided.box_color_key
      warnings.push(...decided.warnings)
    }
  }

  const insertPayload = { ...safeBody, created_by: admin?.id ?? null }
  const { data, error } = await supabase
    .from('today_cards')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(warnings.length > 0 ? { ...data, warnings } : data)
}
