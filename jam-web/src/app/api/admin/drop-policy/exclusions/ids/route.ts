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

// DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1603). 현상 → 원인 → 해결책 순서.
const READ_ERROR_MESSAGE = '드랍 제외 대상 목록을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

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
    // 여기서 던지는 Error는 `resolveBadgeCollectionScope`의 DB 오류 원문뿐이라 응답에 싣지 않는다.
    console.error('[drop-exclusions ids] 조회 조건 처리 오류:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: e instanceof Error ? READ_ERROR_MESSAGE : '조회에 실패했습니다.' }, { status: 500 })
  }

  const { data, count, error } = await query.range(0, SELECT_ALL_CAP - 1)
  if (error) {
    console.error('[drop-exclusions ids] 조회 오류:', error.message)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }

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
