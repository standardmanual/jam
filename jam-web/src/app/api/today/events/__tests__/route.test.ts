/**
 * POST /api/today/events — 분기별 상태 코드와 처리 순서 (티켓 20260924_0850)
 *
 * 인증 → 빈도 제한 → 본문 → 검증 → 노출 → 기록 순으로 걸러낸다. events.ts는 실물을 쓰고
 * Supabase 클라이언트만 목으로 바꿔, insert 오류가 `recordTodayCardEvent`를 거쳐 500이 되는지 본다.
 */
export {}

const { getUser, maybeSingle, insert, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const insert = vi.fn()
  const from = vi.fn((table: string) =>
    table === 'today_cards' ? { select: () => ({ eq: () => ({ maybeSingle }) }) } : { insert },
  )
  return { getUser: vi.fn(), maybeSingle, insert, from }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceClient: () => ({ from }),
}))

const { POST } = await import('../route')

const CARD_ID = '11111111-2222-3333-4444-555555555555'
const VALID_BODY = JSON.stringify({ cardId: CARD_ID, event: 'impression' })
let userSeq = 0

function post(body: string): Request {
  return new Request('https://j-a-m.app/api/today/events', { method: 'POST', body })
}

beforeEach(() => {
  // 빈도 제한 Map은 모듈 전역이라 테스트마다 다른 유저로 로그인해 서로 영향을 주지 않게 한다.
  getUser.mockReset().mockResolvedValue({ data: { user: { id: `user-${userSeq++}` } } })
  maybeSingle.mockReset().mockResolvedValue({
    data: { is_active: true, starts_at: '2000-01-01', ends_at: '2999-01-01', content_type_id: 'type-1' },
    error: null,
  })
  insert.mockReset().mockResolvedValue({ error: null })
  from.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('상태 코드', () => {
  it('비로그인이면 401이고 아무것도 조회·기록하지 않는다', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(post(VALID_BODY))).status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('한 유저가 분당 60건을 넘기면 429이고 61번째는 기록하지 않는다', async () => {
    for (let i = 0; i < 60; i++) expect((await POST(post(VALID_BODY))).status).toBe(204)
    insert.mockClear()
    expect((await POST(post(VALID_BODY))).status).toBe(429)
    expect(insert).not.toHaveBeenCalled()
  })

  it('빈도 제한에 걸린 유저는 잘못된 본문도 400이 아니라 429이고, 로그아웃하면 401이다', async () => {
    for (let i = 0; i < 60; i++) await POST(post(VALID_BODY))
    expect((await POST(post('{not json'))).status).toBe(429)
    expect((await POST(post('x'.repeat(2001)))).status).toBe(429)
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(post(VALID_BODY))).status).toBe(401)
  })

  it.each([
    // 유효한 JSON·필드지만 2000자 초과 — 길이 검사를 지우면 204가 되어 실패한다(JSON 파싱 실패 분기와 구분).
    ['본문이 2000자를 넘으면', JSON.stringify({ cardId: CARD_ID, event: 'impression', pad: 'x'.repeat(2001) })],
    ['JSON이 아니면', '{not json'],
    ['필드 검증에 실패하면(UUID 아님)', JSON.stringify({ cardId: 'abc', event: 'impression' })],
    ['허용하지 않는 event이면(followup)', JSON.stringify({ cardId: CARD_ID, event: 'followup' })],
  ])('%s 400이고 카드 조회 전에 멈춘다', async (_name, body) => {
    expect((await POST(post(body))).status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('카드 노출 검증에 실패하면(카드 없음) 400이고 기록하지 않는다', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await POST(post(VALID_BODY))).status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([
    ['조회 오류가 나면', { data: null, error: { message: '조회 실패' } }, '카드를 확인할 수 없습니다.'],
    ['비활성 카드이면', { data: { is_active: false, starts_at: '2000-01-01', ends_at: '2999-01-01', content_type_id: 't' }, error: null }, '노출 중인 카드가 아닙니다.'],
    ['노출 시작 전이면', { data: { is_active: true, starts_at: '2999-01-01', ends_at: '2999-12-31', content_type_id: 't' }, error: null }, '노출 기간이 아닌 카드입니다.'],
    ['노출 종료 후이면', { data: { is_active: true, starts_at: '2000-01-01', ends_at: '2000-12-31', content_type_id: 't' }, error: null }, '노출 기간이 아닌 카드입니다.'],
  ])('카드 노출 검증에서 %s 400이고 기록하지 않는다', async (_name, row, message) => {
    maybeSingle.mockResolvedValue(row)
    const res = await POST(post(VALID_BODY))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(message)
    expect(insert).not.toHaveBeenCalled()
  })

  it('insert가 실패하면 500이고 오류를 로그로 남긴다', async () => {
    insert.mockResolvedValue({ error: { message: 'insert 실패' } })
    expect((await POST(post(VALID_BODY))).status).toBe(500)
    expect(console.error).toHaveBeenCalled()
  })

  it('성공하면 204에 본문이 없고 유저 ID 없이 유형 ID·그려진 모양만 저장한다(모양이 없는 옛 카드는 null)', async () => {
    const res = await POST(post(VALID_BODY))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(insert).toHaveBeenCalledWith({
      card_id: CARD_ID, content_type_id: 'type-1', card_shape: null, event: 'impression', followup_action: null,
    })
  })

  it('shape가 저장된 카드는 그 모양을 card_shape로 저장한다', async () => {
    maybeSingle.mockResolvedValue({
      data: { is_active: true, starts_at: '2000-01-01', ends_at: '2999-01-01', content_type_id: 'type-1', shape: 'poster', template_type: 'badge_spotlight', layout_type: 'banner', cover_image_url: null, badge_ids: [] },
      error: null,
    })
    expect((await POST(post(VALID_BODY))).status).toBe(204)
    expect(insert).toHaveBeenCalledWith({
      card_id: CARD_ID, content_type_id: 'type-1', card_shape: 'poster', event: 'impression', followup_action: null,
    })
  })
})
