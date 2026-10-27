/**
 * 상황판 화면 계산 (티켓 20261026_2028 3회차)
 *
 * 지키는 것:
 * - 티켓 주소는 경로 조각마다 인코딩하고 `/`는 그대로 둔다
 * - 시각은 KST `YYYY.MM.DD HH:mm`, 읽을 수 없으면 빈 문자열. 커밋은 7자리
 * - 묶음 막대 비율의 합은 100이고, 하위 티켓이 없으면 null
 * - 읽기 안내 줄: 문제가 있는 출처만, `mainIndex: 'missing'`은 안내하지 않고, 한도 초과는 한 줄로 합쳐 토큰을 권한다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/view.test.ts
 */
import { describe, it, expect } from 'vitest'
import { bundleBarOf, formatKstDateTime, indexUnavailableDescription, noticesOf, shortSha, ticketUrl, BOARD_COLUMN_TITLES } from '../view'
import type { SourceKey, SourceState } from '../types'

const OK: Record<SourceKey, SourceState> = {
  stagingIndex: 'ok',
  mainIndex: 'missing',
  deployState: 'ok',
  compare: 'ok',
  deployment: 'ok',
  requests: 'ok',
}
const sources = (overrides: Partial<Record<SourceKey, SourceState>>) => ({ sources: { ...OK, ...overrides } })

describe('ticketUrl', () => {
  it('경로 조각마다 인코딩하고 슬래시는 그대로 둔다', () => {
    expect(ticketUrl('docs/tickets/p2-normal/20261026_2028_Admin_개발 요청#1.md')).toBe(
      'https://github.com/standardmanual/jam/blob/staging/docs/tickets/p2-normal/20261026_2028_Admin_%EA%B0%9C%EB%B0%9C%20%EC%9A%94%EC%B2%AD%231.md'
    )
  })
})

describe('formatKstDateTime · shortSha', () => {
  it('UTC 시각을 KST로 바꿔 YYYY.MM.DD HH:mm으로 쓴다', () => {
    expect(formatKstDateTime('2026-10-14T07:31:59Z')).toBe('2026.10.14 16:31')
    expect(formatKstDateTime('2026-10-14T16:00:00Z')).toBe('2026.10.15 01:00')
  })
  it('읽을 수 없는 시각은 빈 문자열이다', () => {
    expect(formatKstDateTime('아님')).toBe('')
  })
  it('커밋은 7자리, 없으면 빈 문자열이다', () => {
    expect(shortSha('1e2d55e2abcdef')).toBe('1e2d55e')
    expect(shortSha(null)).toBe('')
  })
})

describe('bundleBarOf', () => {
  it('합계가 0이면 null이다', () => {
    expect(bundleBarOf({ done: 0, active: 0, remaining: 0, total: 0 })).toBeNull()
  })
  it('끝남·진행·남음 비율을 구하고 합이 100이다', () => {
    expect(bundleBarOf({ done: 11, active: 0, remaining: 6, total: 17 })).toEqual({ done: 64.71, active: 0, remaining: 35.29 })
    const bar = bundleBarOf({ done: 7, active: 1, remaining: 37, total: 45 })!
    expect(bar.done + bar.active + bar.remaining).toBeCloseTo(100, 5)
    expect(bar).toEqual({ done: 15.56, active: 2.22, remaining: 82.22 })
  })
  it('전부 끝났으면 끝남이 100이다', () => {
    expect(bundleBarOf({ done: 3, active: 0, remaining: 0, total: 3 })).toEqual({ done: 100, active: 0, remaining: 0 })
  })
})

describe('noticesOf', () => {
  it('문제가 없으면 빈 배열이다 (mainIndex가 missing인 것은 정상이다)', () => {
    expect(noticesOf(sources({}))).toEqual([])
  })

  it('한도 초과는 출처가 여럿이어도 한 줄이고 GITHUB_READ_TOKEN을 권한다', () => {
    const notices = noticesOf(sources({ compare: 'rate_limited', deployment: 'rate_limited', stagingIndex: 'rate_limited' }))
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ key: 'rate_limited', cause: '읽기 한도를 넘었어요' })
    expect(notices[0].fix).toContain('GITHUB_READ_TOKEN')
  })

  it('main 색인을 못 읽었으면 배포됨이 임시 추정이라고 알린다', () => {
    expect(noticesOf(sources({ mainIndex: 'error' })).map((n) => n.summary)).toEqual(['배포됨은 임시 추정이에요'])
  })

  it('배포 상태 파일이 없거나 못 읽으면 「확인 안 됨」임을 알린다', () => {
    const missing = noticesOf(sources({ deployState: 'missing' }))
    expect(missing).toHaveLength(1)
    expect(missing[0].cause).toContain('아직 없어요')
    expect(noticesOf(sources({ deployState: 'error' }))[0].cause).toContain('읽지 못했어요')
  })

  it('앞선 커밋 수·마지막 배포·개발 요청 실패는 각각 한 줄이다', () => {
    const notices = noticesOf(sources({ compare: 'error', deployment: 'error', requests: 'error' }))
    expect(notices.map((n) => n.key)).toEqual(['compare', 'deployment', 'requests'])
    for (const notice of notices) {
      expect(notice.summary).not.toBe('')
      expect(notice.cause).not.toBe('')
      expect(notice.fix).not.toBe('')
    }
  })

  it('배포 기록이 missing이면(main 마지막 커밋으로 대신) 안내하지 않고, staging 색인 실패는 안내 카드가 말하므로 여기서 안내하지 않는다', () => {
    expect(noticesOf(sources({ deployment: 'missing' }))).toEqual([])
    expect(noticesOf(sources({ stagingIndex: 'error' }))).toEqual([])
  })
})

describe('상수·글자', () => {
  it('보드 칸 이름', () => {
    expect(BOARD_COLUMN_TITLES).toEqual({ waiting: '대기', progress: '진행', staged: 'staging 반영', deployed: '배포됨' })
  })
  it('색인을 못 읽었을 때 안내 설명은 상태마다 다르다', () => {
    expect(indexUnavailableDescription('rate_limited')).toContain('GITHUB_READ_TOKEN')
    expect(indexUnavailableDescription('missing')).toContain('색인 파일이 없어요')
    expect(indexUnavailableDescription('error')).toContain('읽지 못했어요')
  })
})
