import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchSheetValues } from '@/lib/googleSheets'

/**
 * VOC CS 게시판 피드 API (티켓 20260828_1921).
 *
 * Google Sheets(Tally 연동)를 데이터 소스로 쓴다 — Supabase 미사용. 시트 컬럼 중
 * Respondent ID(B)·이메일(D)·기기브라우저(H)·스크린샷 URL(I)은 **이 라우트가 응답에서
 * 절대 내려보내지 않는다** — 클라이언트는 이 라우트를 통해서만 시트에 접근하므로
 * 여기가 유일한 민감정보 차단 지점이다.
 *
 * 캐시하지 않는다 — "새로고침 시 반영이면 충분"이 요구사항이라 매 요청 fresh fetch.
 */

const SPREADSHEET_ID = '1LimKjqlOWU9JmNxG_W7bpfn_UbcyVEbKLQJ9WLKn60s'
// A~L열만 읽는다. M열(크루 전용 이미지 미리보기 수식)은 애초에 범위에서 제외한다.
const SHEET_RANGE = 'VOC!A2:L'
const PAGE_SIZE = 20

export type VocSortKey = 'latest' | 'answered'

export interface VocItem {
  /** 자동 넘버링 — 제출 순서 오름차순(가장 오래된 글=1) */
  number: number
  status: string
  submittedAt: string
  categories: string[]
  text: string
  severity: number
  /** 상태=답변완료일 때만 값이 있다 */
  answer: string | null
  /** 상태=답변완료일 때만 값이 있다 */
  answeredAt: string | null
}

interface ParsedEntry extends VocItem {
  /** 정렬용 타임스탬프(ms). 파싱 실패 시 원본 행 순서를 폴백으로 쓴다 */
  sortSubmitted: number
  /** 정렬용 타임스탬프(ms). 미답변이면 -1(항상 뒤로 밀림) */
  sortAnswered: number
}

const ANSWERED_STATUS = '답변완료'

function parseRow(row: string[], fallbackOrder: number): ParsedEntry | null {
  const submittedAt = row[2]?.trim()
  if (!submittedAt) return null // 빈 행 스킵

  const status = row[9]?.trim() || '문의중'
  const categories = (row[4] ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  const text = row[5]?.trim() ?? ''
  const severityNum = Number(row[6])
  const severity = Number.isFinite(severityNum) ? severityNum : 0
  const isAnswered = status === ANSWERED_STATUS
  const answer = isAnswered && row[10]?.trim() ? row[10].trim() : null
  const answeredAt = isAnswered && row[11]?.trim() ? row[11].trim() : null

  const submittedTime = Date.parse(submittedAt)
  const answeredTime = answeredAt ? Date.parse(answeredAt) : NaN

  return {
    number: 0, // 아래에서 제출 순서 오름차순으로 재계산해 채운다
    status,
    submittedAt,
    categories,
    text,
    severity,
    answer,
    answeredAt,
    sortSubmitted: Number.isFinite(submittedTime) ? submittedTime : fallbackOrder,
    sortAnswered: Number.isFinite(answeredTime) ? answeredTime : -1,
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const sort: VocSortKey = searchParams.get('sort') === 'answered' ? 'answered' : 'latest'
  const pageParam = Number(searchParams.get('page'))
  const requestedPage = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

  try {
    const rows = await fetchSheetValues(SPREADSHEET_ID, SHEET_RANGE)
    const parsed = rows
      .map((row, i) => parseRow(row, i))
      .filter((r): r is ParsedEntry => r !== null)

    // 번호 — 제출 순서 오름차순(가장 오래된 글=1번)으로 계산해 부여
    const bySubmission = [...parsed].sort((a, b) => a.sortSubmitted - b.sortSubmitted)
    bySubmission.forEach((entry, i) => {
      entry.number = i + 1
    })

    // 화면 정렬
    const sorted = [...parsed].sort((a, b) => {
      if (sort === 'answered') {
        // 최신 답변 순 — 답변일시 없는 글(sortAnswered=-1)은 항상 뒤로 밀리되 필터링하지 않는다
        if (a.sortAnswered !== b.sortAnswered) return b.sortAnswered - a.sortAnswered
        return b.sortSubmitted - a.sortSubmitted
      }
      return b.sortSubmitted - a.sortSubmitted
    })

    const totalCount = sorted.length
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    const page = Math.min(requestedPage, totalPages)
    const start = (page - 1) * PAGE_SIZE
    const items: VocItem[] = sorted.slice(start, start + PAGE_SIZE).map((entry) => ({
      number: entry.number,
      status: entry.status,
      submittedAt: entry.submittedAt,
      categories: entry.categories,
      text: entry.text,
      severity: entry.severity,
      answer: entry.answer,
      answeredAt: entry.answeredAt,
    }))

    return NextResponse.json({ items, page, totalPages, totalCount })
  } catch (err) {
    console.error('[api/voc] Google Sheets 조회 실패', err)
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
