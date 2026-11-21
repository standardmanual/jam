import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, getAdminUser } from '@/lib/admin/auth'
import {
  hasFeedCardColumns,
  pickFeedCardColumns,
  validateFeedCardColumns,
  type FeedCardColumns,
} from '@/lib/admin/feedCardFields'
import { completeFeedCardValues } from '@/lib/admin/feedCardServer'
import { coverColorsFields, type CoverColorsFields } from '@/lib/admin/coverColors'
import { fetchFeedPalette } from '@/lib/today/feedColorOverridesRead'

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

  // 커버 이미지가 있으면 대표 색을 같은 insert에 담는다(티켓 20261121_1724). 추출이 실패하면 칸을 비워 둔다(NULL=아직 안 뽑음).
  // 자동 색 배정이 이 대표 색을 쓰므로(티켓 20261121_1828) 배정보다 먼저 뽑는다. 검증이 실패하면 뽑지 않도록 처음 쓰는 곳에서 한 번만 뽑는다.
  let coverColorsMemo: CoverColorsFields | null = null
  const getCoverColors = async (): Promise<CoverColorsFields> => {
    coverColorsMemo ??= await coverColorsFields(typeof safeBody.cover_image_url === 'string' ? safeBody.cover_image_url : null)
    return coverColorsMemo
  }

  // 개편 칸(마이그레이션 349)이 본문에 있으면 검증하고, 유형이 있는 새 카드는 비어 있는 시드·색 키를 정해 고정한다(티켓 20261121_1315).
  // 개편 칸이 없는 옛 본문은 이전과 똑같이 그대로 저장한다.
  const warnings: string[] = []
  if (hasFeedCardColumns(safeBody)) {
    const columns = pickFeedCardColumns(safeBody)
    // 컬러셋 교체로 덮어쓴 hex를 합친 팔레트(티켓 20261121_2145) — 색 규칙 경고와 자동 배정이 같은 표를 쓴다. 읽기가 실패하면 기본 팔레트다.
    const palette = await fetchFeedPalette(supabase, '[today POST 색 덮어쓰기 조회 오류]')
    const checked = validateFeedCardColumns(columns, {
      title: typeof safeBody.title === 'string' ? safeBody.title : '',
      itemBookId: typeof safeBody.item_book_id === 'string' ? safeBody.item_book_id : null,
      palette,
    })
    if (checked.errors.length > 0) {
      return NextResponse.json({ error: checked.errors.join(' '), errors: checked.errors }, { status: 400 })
    }
    warnings.push(...checked.warnings)

    if (columns.feed_type) {
      const cover = await getCoverColors()
      const decided = await completeFeedCardValues(
        supabase,
        columns as Partial<FeedCardColumns>,
        { startsAt: safeBody.starts_at, endsAt: safeBody.ends_at },
        undefined,
        '[today POST 배경색 사용 빈도 조회 오류]',
        {
          feedType: columns.feed_type as string,
          boxKind: typeof columns.box_kind === 'string' ? columns.box_kind : null,
          coverColors: cover.cover_colors ?? null,
          badgeIds: Array.isArray(safeBody.badge_ids) ? (safeBody.badge_ids as string[]) : null,
        },
        palette,
      )
      if (decided.imageRuleSkipped) console.warn('[today POST 색 자동 배정] 이미지 규칙까지 통과하는 조합이 없어 이미지 규칙 없이 정했어요')
      safeBody.feed_seed = decided.feed_seed
      safeBody.bg_color_key = decided.bg_color_key
      safeBody.chip_color_key = decided.chip_color_key
      safeBody.box_color_key = decided.box_color_key
      warnings.push(...decided.warnings)
    }
  }

  const coverColors = await getCoverColors()
  const insertPayload = { ...safeBody, ...coverColors, created_by: admin?.id ?? null }
  const { data, error } = await supabase
    .from('today_cards')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(warnings.length > 0 ? { ...data, warnings } : data)
}
