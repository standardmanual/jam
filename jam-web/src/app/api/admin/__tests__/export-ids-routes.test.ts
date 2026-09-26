/**
 * UUID `ids`를 받는 어드민 export 라우트 10곳이 공용 `parseExportIds`로 요청을 거른다(티켓 20260926_1412).
 * UUID가 아닌 값·상한 초과는 DB에 닿기 전에 400으로 거절되고, 빈 선택은 각 라우트의 기존 문구를 유지하며,
 * 유효한 요청은 검증을 통과해 DB 조회 단계로 넘어간다.
 * 정상 경로(티켓 20260926_1410)는 조회가 전부 빈 결과를 돌려주는 DB 대역으로 CSV 응답의 모양 —
 * 200·`text/csv`·파일명·BOM과 헤더 행·200건 청크 — 을 라우트별로 확인한다. 행 단위 본문은
 * `badges/export`의 라우트 테스트가 갖는다.
 * 제외한 라우트: `badge-families/export`(ids가 UUID가 아닌 계열 키).
 * 실행: cd jam-web && npx vitest run src/app/api/admin/__tests__/export-ids-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const createServiceClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createServiceClient }))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: async () => null }))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface RouteCase {
  path: string
  load: () => Promise<{ POST: (req: NextRequest) => Promise<Response> }>
  empty: string
  /** 응답 파일명 접두어 — `<prefix>_YYYYMMDD.csv` */
  filePrefix: string
  /** CSV 헤더 행(BOM 뒤 첫 줄) */
  headers: string[]
  /** 선택한 id를 200건씩 나눠 `.in()`으로 읽는 조회 — 그런 조회가 없는 라우트는 생략 */
  chunkedTable?: string
}

const ROUTES: RouteCase[] = [
  {
    path: 'badges',
    load: () => import('../badges/export/route'),
    empty: '내보낼 배지를 선택해주세요.',
    filePrefix: 'badges',
    headers: ['ID', '이름', '타입', '희귀도', '트라이브', '활동', '패치가', '상태'],
    chunkedTable: 'badges',
  },
  {
    path: 'item-badges',
    load: () => import('../item-badges/export/route'),
    empty: '내보낼 아이템배지를 선택해주세요.',
    filePrefix: 'item_badges',
    headers: ['ID', '이름', '등급', '트라이브', '컬렉션', '총 발급 수'],
    chunkedTable: 'badges',
  },
  {
    path: 'item-badges/orphaned',
    load: () => import('../item-badges/orphaned/export/route'),
    empty: '내보낼 개체를 선택해주세요.',
    filePrefix: 'orphaned_item_badges',
    headers: ['ID', '배지', '배지 ID', '등급', '일련번호', '발급일시'],
  },
  {
    path: 'itembooks',
    load: () => import('../itembooks/export/route'),
    empty: '내보낼 컬렉션을 선택해주세요.',
    filePrefix: 'itembooks',
    headers: ['ID', '이름', '트라이브', '필수 액티비티 배지', '보상 배지', '상태', '노출 시작', '노출 종료'],
    chunkedTable: 'item_books',
  },
  {
    path: 'missions',
    load: () => import('../missions/export/route'),
    empty: '내보낼 미션을 선택해주세요.',
    filePrefix: 'missions',
    headers: ['ID', '제목', '구분', '미션 유형', '시작', '종료', '상태', '노출', '보상 배지 수', '보상 포인트', '달성 수'],
    chunkedTable: 'missions',
  },
  {
    path: 'poi',
    load: () => import('../poi/export/route'),
    empty: '내보낼 POI를 선택해주세요.',
    filePrefix: 'poi',
    headers: ['ID', '이름', '카테고리', '위도', '경도', '반경(m)', '등급', '연결 배지', '상태'],
    chunkedTable: 'poi',
  },
  {
    path: 'points/ledger',
    load: () => import('../points/ledger/export/route'),
    empty: '내보낼 원장을 선택해주세요.',
    filePrefix: 'points_ledger',
    headers: ['ID', '일시', '유저 ID', '유저', '금액(P)', '사유', '메모'],
    chunkedTable: 'point_transactions',
  },
  {
    path: 'recipes',
    load: () => import('../recipes/export/route'),
    empty: '내보낼 레시피를 선택해주세요.',
    filePrefix: 'recipes',
    headers: ['ID', '이름', '슬롯 수', '슬롯 상세', '보상 포인트', '보상 배지', '등록일'],
    chunkedTable: 'combination_recipes',
  },
  {
    path: 'today',
    load: () => import('../today/export/route'),
    empty: '내보낼 카드를 선택해 주세요.',
    filePrefix: 'today',
    headers: ['ID', '제목', '템플릿', '노출형태', '노출조건', '시작', '종료', '노출 순서', '상태'],
    chunkedTable: 'today_cards',
  },
  {
    path: 'users',
    load: () => import('../users/export/route'),
    empty: '내보낼 유저를 선택해주세요.',
    filePrefix: 'users',
    headers: ['ID', '이름', '표시 이름', '이메일', '트라이브', '가입일', '온보딩', '어드민', '제재'],
    chunkedTable: 'users',
  },
]

/** 체이닝 어디서 await해도 「빈 결과」로 풀리는 DB 대역 — `.in()` 호출만 표·인자와 함께 기록한다 */
const inCalls: { table: string; ids: string[] }[] = []
function emptyDb() {
  const result = { data: [], count: 0, error: null }
  const query = (table: string): unknown =>
    new Proxy(function () {}, {
      get: (_target, prop) => {
        if (prop === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
        return (...args: unknown[]) => {
          if (prop === 'in') inCalls.push({ table, ids: args[1] as string[] })
          return query(table)
        }
      },
    })
  return { from: (table: string) => query(table), rpc: () => query('rpc') }
}

// 예외를 삼키지 않는다 — 검증을 통과한 요청이 DB 대역 앞에서 던지면 테스트가 그대로 실패해야 한다.
async function call(load: RouteCase['load'], path: string, body: unknown): Promise<Response> {
  const { POST } = await load()
  const req = new NextRequest(`https://j-a-m.app/api/admin/${path}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req)
}

beforeEach(() => {
  inCalls.length = 0
  createServiceClient.mockReset()
  createServiceClient.mockImplementation(() => emptyDb())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe.each(ROUTES)('POST /api/admin/$path/export ids 검증', ({ path, load, empty }) => {
  it('UUID가 아닌 값이 섞이면 400과 안내 문구를 돌려주고 DB에 닿지 않는다', async () => {
    const res = await call(load, path, { ids: [uuid(1), 'a; drop table'] })
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toBe('선택한 항목의 식별자 형식이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('1,000건을 넘으면 400으로 거절하고 DB에 닿지 않는다', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => uuid(i))
    const res = await call(load, path, { ids })
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toBe('한 번에 최대 1,000건까지 내보낼 수 있습니다. 선택을 줄여 다시 시도해 주세요.')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('빈 선택은 이 라우트의 기존 문구로 400을 돌려준다', async () => {
    const res = await call(load, path, { ids: [] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(empty)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('유효한 UUID 목록은 검증을 통과해 DB 조회 단계로 넘어간다', async () => {
    const res = await call(load, path, { ids: [uuid(1), uuid(2)] })
    expect(res.status).toBe(200)
    expect(createServiceClient).toHaveBeenCalled()
  })
})

describe.each(ROUTES)('POST /api/admin/$path/export 정상 경로', ({ path, load, filePrefix, headers, chunkedTable }) => {
  it('200과 CSV 헤더·파일명·BOM 뒤 헤더 행을 돌려준다', async () => {
    const res = await call(load, path, { ids: [uuid(1), uuid(2)] })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(new RegExp(`^attachment; filename="${filePrefix}_\\d{8}\\.csv"$`))
    // `Response.text()`는 UTF-8 BOM을 벗겨 내므로 바이트로 BOM을 확인한다.
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    // 조회 결과가 없으면 헤더 행만 남는다
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).slice(1)).toBe(headers.join(','))
  })

  if (chunkedTable) {
    it('선택한 id를 200건씩 나눠 조회한다(201건이면 200 + 1)', async () => {
      const ids = Array.from({ length: 201 }, (_, i) => uuid(i))
      const res = await call(load, path, { ids })
      expect(res.status).toBe(200)
      const sizes = inCalls.filter((c) => c.table === chunkedTable).map((c) => c.ids.length)
      expect(sizes.slice(0, 2)).toEqual([200, 1])
    })
  }
})
