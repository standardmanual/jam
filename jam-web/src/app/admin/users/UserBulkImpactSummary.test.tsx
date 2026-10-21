/**
 * 유저 일괄 처리 확인창의 영향 안내 — 회수 사전 확인 문구 (티켓 20261019_1318 2회)
 * 잔액보다 큰 회수는 마이너스가 되지 않고 그 유저만 건너뛴다(티켓 20261019_1314). 문구가 그 사실을 말하는지 서버 렌더로 확인한다.
 * jsdom이 없어(`environment: 'node'`) `renderToStaticMarkup`을 쓰고, 이어 붙은 글자 사이에 끼는 `<!-- -->`는 지운 글로 비교한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/users/UserBulkImpactSummary.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UserBulkImpactSummary } from './UserBulkImpactSummary'

const base = { targetCount: 3, excludedAdminCount: 0, excludedSelfCount: 0, totalAmount: -300, notificationCount: 3 }

function render(impact: Record<string, number>): string {
  return renderToStaticMarkup(<UserBulkImpactSummary action="grant_points" impact={impact} skippedCount={0} />)
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

describe('UserBulkImpactSummary — 회수 사전 확인', () => {
  it('잔액이 모자란 유저가 있으면 «회수하지 못하고 건너뛰는 유저 N명»으로 알린다(마이너스가 된다는 옛 문구가 아니다)', () => {
    const t = render({ ...base, revokeSkippedCount: 2 })
    expect(t).toContain('회수하지 못하고 건너뛰는 유저 2명')
    expect(t).not.toContain('마이너스')
  })

  it('건너뛰는 유저가 없으면 그 줄을 보이지 않는다', () => {
    expect(render({ ...base, revokeSkippedCount: 0 })).not.toContain('건너뛰는 유저')
    expect(render(base)).not.toContain('건너뛰는 유저')
  })

  it('회수 합계는 절댓값으로 보인다', () => {
    expect(render({ ...base, revokeSkippedCount: 0 })).toContain('회수 합계 300P')
  })
})
