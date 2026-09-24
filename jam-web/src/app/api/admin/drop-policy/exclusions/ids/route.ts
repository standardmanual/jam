import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { pickSingleQueryParamsFromURL } from '@/lib/searchParams'
import {
  parseDropExclusionParams,
  applyBadgeExclusionQuery,
  applyCollectionExclusionQuery,
  resolveBadgeCollectionScope,
  type ExclusionQuery,
  type TribeCollectionsClient,
} from '@/lib/admin/drop-exclusion-list'

/**
 * 드랍 제외 관리 "이 조건의 N건 모두 선택" 배너가 부르는 탭별 전체 ID 조회(티켓 20260924_0948,
 * 상위 티켓 §6 결정 1) — 목록 페이지와 같은 쿼리 빌더로 필터링해, 화면의 "총 N개"와 여기서
 * 돌려주는 건수가 항상 같다. `tab` 쿼리가 아이템배지(`badges`)·컬렉션(`collections`)을 고른다.
 */
const SELECT_ALL_CAP = 1000

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const params = parseDropExclusionParams(pickSingleQueryParamsFromURL(req.nextUrl.searchParams))
  const supabase = createServiceClient()

  let query: ExclusionQuery<{ id: string }>
  try {
    if (params.tab === 'badges') {
      const scope = await resolveBadgeCollectionScope(supabase as unknown as TribeCollectionsClient, params)
      if (scope.kind === 'collections' && scope.ids.length === 0) return NextResponse.json({ ids: [] })
      query = applyBadgeExclusionQuery(
        supabase.from('badges').select('id', { count: 'exact' }) as unknown as ExclusionQuery<{ id: string }>,
        params,
        scope
      )
    } else {
      query = applyCollectionExclusionQuery(
        supabase.from('item_books').select('id', { count: 'exact' }) as unknown as ExclusionQuery<{ id: string }>,
        params
      )
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '조회에 실패했습니다.' }, { status: 500 })
  }

  const { data, count, error } = await query.range(0, SELECT_ALL_CAP - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ((count ?? 0) > SELECT_ALL_CAP) {
    return NextResponse.json(
      {
        error: `조건에 맞는 항목이 ${count}건이라 한 번에 선택할 수 있는 상한(${SELECT_ALL_CAP}건)을 넘습니다. 필터를 좁혀주세요.`,
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ ids: (data ?? []).map((row) => row.id) })
}
