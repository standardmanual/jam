/**
 * 출처 표의 초기 렌더와 쓰기 요청 (티켓 20261026_2033 2회차)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 처음 그린 모양을 고정하고(표 칸·마지막으로 읽은 시각·스위치 상태·빈 상태),
 * 클릭이 보내는 요청의 주소·방식·본문과 서버 오류 문장을 한 줄로 만드는 규칙은 `sourceClient`를 직접 부른다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-trends',
  useSearchParams: () => new URLSearchParams(''),
}))

import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { OPS_TREND_SOURCE_FOLDERS } from '@/lib/admin/opsTrends/constants'
import {
  OpsTrendSources,
  SourceAddForm,
  SourceEditForm,
  TREND_SOURCE_EMPTY,
  TREND_SOURCE_FOLDER_HINT,
  TREND_SOURCE_MANUAL_HINT,
  TREND_SOURCE_NEVER_READ,
  type OpsTrendSourceRow,
} from '../OpsTrendSources'
import {
  createTrendSourceRequest,
  deleteTrendSourceRequest,
  errorLineOf,
  setTrendSourceEnabledRequest,
  trendSourceUrl,
  updateTrendSourceRequest,
} from '../sourceClient'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

function row(overrides: Partial<OpsTrendSourceRow> = {}): OpsTrendSourceRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    no: 1,
    name: '러닝 해시태그',
    kind: 'hashtag',
    location: '#러닝',
    enabled: true,
    lastReadAt: '2026-10-26T00:30:00Z',
    ...overrides,
  }
}

describe('OpsTrendSources 렌더', () => {
  it('출처가 하나도 없으면 한 줄 안내와 추가 버튼이 나온다', () => {
    const out = flat(<OpsTrendSources sources={[]} />)
    expect(out).toContain(TREND_SOURCE_EMPTY)
    expect(out).toContain('출처 추가')
    expect(out).not.toContain('<table')
  })

  it('표에 번호·이름·종류 글자·위치·마지막으로 읽은 시각이 나온다', () => {
    const out = flat(<OpsTrendSources sources={[row()]} />)
    expect(out).toContain('러닝 해시태그')
    expect(out).toContain('해시태그')
    expect(out).toContain('#러닝')
    expect(out).toContain('10/26(월) 09:30')
  })

  it('읽은 적 없는 출처는 「아직 읽지 않았어요」다', () => {
    expect(flat(<OpsTrendSources sources={[row({ lastReadAt: null })]} />)).toContain(TREND_SOURCE_NEVER_READ)
  })

  it('켜짐·꺼짐은 스위치 상태와 글자로 함께 나온다', () => {
    const on = flat(<OpsTrendSources sources={[row()]} />)
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('켜짐')
    const off = flat(<OpsTrendSources sources={[row({ enabled: false })]} />)
    expect(off).toContain('aria-checked="false"')
    expect(off).toContain('꺼짐')
  })

  it('스위치에 출처 이름이 붙은 접근 가능한 이름이 있다', () => {
    expect(flat(<OpsTrendSources sources={[row()]} />)).toContain('aria-label="러닝 해시태그 사용"')
  })

  it('직접 올린 자료는 위치가 비어도 파일 목록 안내가 보인다', () => {
    const out = flat(<OpsTrendSources sources={[row({ kind: 'manual_upload', location: '', name: '수동 자료' })]} />)
    expect(out).toContain('직접 올린 자료')
    expect(out).toContain(TREND_SOURCE_MANUAL_HINT)
  })

  it('추가 양식은 누르기 전에는 닫혀 있다', () => {
    expect(flat(<OpsTrendSources sources={[row()]} />)).not.toContain('aria-label="출처 추가"')
  })

  it('각 행에 관리 열과 수정·삭제 버튼이 제공된다', () => {
    const out = flat(<OpsTrendSources sources={[row()]} />)
    expect(out).toContain('관리')
    expect(out).toContain('aria-label="러닝 해시태그 수정"')
    expect(out).toContain('aria-label="러닝 해시태그 삭제"')
  })
})

describe('SourceEditForm 수정 양식', () => {
  it('기존 이름과 위치가 입력되어 있고 종류는 읽기 전용으로 표시된다', () => {
    const out = flat(<SourceEditForm source={row()} onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(out).toContain('aria-label="출처 수정"')
    expect(out).toContain('출처 1 수정')
    expect(out).toContain('value="러닝 해시태그"')
    expect(out).toContain('value="#러닝"')
    expect(out).toContain('해시태그')
    expect(out).toContain('저장하기')
    expect(out).toContain('취소')
  })

  it('저장소 폴더 종류는 위치가 폴더 선택기로 나온다', () => {
    const out = flat(
      <SourceEditForm
        source={row({ kind: 'repo_folder', location: OPS_TREND_SOURCE_FOLDERS[0], name: '트렌드 문서' })}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(out).toContain('저장소 폴더')
    expect(out).toContain('aria-labelledby="trend-source-edit-location-label"')
    expect(out).toContain(TREND_SOURCE_FOLDER_HINT)
  })
})

describe('SourceAddForm 위치 칸', () => {
  const form = (initialKind: OpsTrendSourceRow['kind']) =>
    flat(<SourceAddForm initialKind={initialKind} onDone={vi.fn()} onCancel={vi.fn()} />)
  const inputCount = (out: string) => (out.match(/<input/g) ?? []).length

  it('저장소 폴더면 위치가 글자 입력이 아니라 폴더 선택이고 안내 한 줄이 나온다', () => {
    const out = form('repo_folder')
    expect(inputCount(out)).toBe(1) // 이름 입력만 남는다
    expect(out).toContain('aria-labelledby="trend-source-location-label"')
    expect(out).toContain('목록에서 골라요')
    expect(out).not.toContain('placeholder="목록에서 골라요"')
    expect(out).toContain('placeholder="예: 트렌드 리서치"')
    expect(out).toContain(TREND_SOURCE_FOLDER_HINT)
  })

  it('폴더를 고르기 전에는 추가하기가 눌리지 않는다', () => {
    expect(form('repo_folder')).toMatch(/<button[^>]*disabled=""[^>]*>추가하기<\/button>/)
  })

  it('다른 종류는 위치가 글자 입력이고 폴더 안내가 없다', () => {
    const out = form('hashtag')
    expect(inputCount(out)).toBe(2) // 이름 + 위치
    expect(out).toContain('placeholder="예: #러닝크루"')
    expect(out).not.toContain('trend-source-location-label')
    expect(out).not.toContain(TREND_SOURCE_FOLDER_HINT)
  })
})

describe('sourceClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('끄기는 PATCH /[id]에 enabled만 보낸다', async () => {
    const fetchMock = stubFetch(200, { source: {} })
    const result = await setTrendSourceEnabledRequest('abc-123', false)
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(trendSourceUrl('abc-123'))
    expect(url).toBe('/api/admin/ops-trend-sources/abc-123')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false })
  })

  it('추가는 POST에 이름·종류·위치를 보낸다', async () => {
    const fetchMock = stubFetch(201, { source: {} })
    const result = await createTrendSourceRequest({ name: '러닝', kind: 'hashtag', location: '#러닝' })
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/ops-trend-sources')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ name: '러닝', kind: 'hashtag', location: '#러닝' })
  })

  it('저장소 폴더 추가는 종류와 고른 폴더 경로를 그대로 보낸다', async () => {
    const fetchMock = stubFetch(201, { source: {} })
    await createTrendSourceRequest({ name: '트렌드 리서치', kind: 'repo_folder', location: OPS_TREND_SOURCE_FOLDERS[0] })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ name: '트렌드 리서치', kind: 'repo_folder', location: 'docs/operations/trendresearch/' })
  })

  it('409는 서버 문장을 그대로 돌려준다', async () => {
    stubFetch(409, { error: '같은 이름의 출처가 이미 있어요. 다른 이름으로 등록해 주세요.' })
    const result = await createTrendSourceRequest({ name: '러닝', kind: 'hashtag', location: '#러닝' })
    expect(result).toEqual({ ok: false, status: 409, message: '같은 이름의 출처가 이미 있어요. 다른 이름으로 등록해 주세요.' })
  })

  it('400은 details를 한 줄로 이어 보인다', async () => {
    stubFetch(400, { error: '출처 형식이 맞지 않아요.', details: ['name: 비어 있어요.', 'location: 적어 주세요.'] })
    const result = await createTrendSourceRequest({ name: '', kind: 'hashtag', location: '' })
    expect(result).toEqual({ ok: false, status: 400, message: 'name: 비어 있어요. location: 적어 주세요.' })
  })

  it('응답을 받지 못하면 고정 문장이다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const result = await setTrendSourceEnabledRequest('abc', true)
    expect(result).toEqual({ ok: false, status: 0, message: NETWORK_ERROR_MESSAGE })
  })

  it('수정은 PATCH /[id]에 변경할 필드를 보낸다', async () => {
    const fetchMock = stubFetch(200, { source: {} })
    const result = await updateTrendSourceRequest('abc-123', { name: '새 이름', location: '#새태그' })
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(trendSourceUrl('abc-123'))
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ name: '새 이름', location: '#새태그' })
  })

  it('삭제는 DELETE /[id]를 보낸다', async () => {
    const fetchMock = stubFetch(200, { ok: true })
    const result = await deleteTrendSourceRequest('abc-123')
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(trendSourceUrl('abc-123'))
    expect(init.method).toBe('DELETE')
  })

  it('본문을 읽을 수 없는 실패는 일반 문장이다', () => {
    expect(errorLineOf(null)).toContain('요청을 처리하지 못했어요')
    expect(errorLineOf({ details: [] })).toContain('요청을 처리하지 못했어요')
  })
})
