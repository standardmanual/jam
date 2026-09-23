import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { selectCorpusForType } from '@/lib/content-corpus/select'
import { DEFAULT_CORPUS_EXCERPT_LIMIT, isContentCorpusTypeId } from '@/lib/content-corpus/types'

/**
 * GET /api/admin/content-corpus?type=T02&limit=3&badgeIds=... — 유형별 선별 발췌
 * (티켓 20260923_2256)
 *
 * 예약 생성 세션이 컨텐츠 유형 ID를 주면, 그 유형에 필요한 발췌만(트라이브·컬렉션·배지
 * 코퍼스 전체가 아니라) 돌려준다. 어드민 세션 쿠키 없이 자동화 토큰(`x-admin-read-token`,
 * 티켓 20260918_1149)으로도 조회할 수 있게 `requireAdminRead`를 쓴다(읽기 전용 GET).
 *
 * 쿼리 파라미터:
 * - `type`: T01~T17 중 하나(필수)
 * - `limit`: 종류별 발췌 상한(기본 3, PRD §4 규칙4)
 * - `tribeIds`·`itemBookIds`·`badgeIds`: 콤마로 구분한 후보 ID 목록. 어떤 유형이 어떤
 *   종류를 쓰는지는 `CONTENT_CORPUS_MAPPING`이 정한다 — 여기서 넘긴 ID라도 매핑에 없는
 *   종류는 조회하지 않는다.
 *
 * 응답은 대상 선택(targets, 활성만)과 본문 인용(quotes, 유형에 따라 비활성 포함 가능)을
 * 분리해서 담는다. 원문은 요약·재작성 없이 그대로 실린다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const typeId = searchParams.get('type')
  if (!typeId || !isContentCorpusTypeId(typeId)) {
    return NextResponse.json(
      { error: '유효한 type 파라미터가 필요합니다 (T01~T17).' },
      { status: 400 }
    )
  }

  const limitParam = searchParams.get('limit')
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : DEFAULT_CORPUS_EXCERPT_LIMIT
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_CORPUS_EXCERPT_LIMIT

  const parseIds = (key: string) =>
    (searchParams.get(key) ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

  try {
    const selection = await selectCorpusForType(
      typeId,
      {
        tribeIds: parseIds('tribeIds'),
        itemBookIds: parseIds('itemBookIds'),
        badgeIds: parseIds('badgeIds'),
      },
      limit
    )
    return NextResponse.json(selection)
  } catch (err) {
    console.error('[/api/admin/content-corpus] 조회 오류:', err)
    return NextResponse.json({ error: '코퍼스 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
