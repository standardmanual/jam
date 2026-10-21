/**
 * 유저 일괄 처리 확인창의 영향 안내 — 회수 사전 확인 문구 (티켓 20261019_1318 2회), 삭제 안내 문구 (티켓 20261021_1249 1회)
 * 잔액보다 큰 회수는 마이너스가 되지 않고 그 유저만 건너뛴다(티켓 20261019_1314). 문구가 그 사실을 말하는지 서버 렌더로 확인한다.
 * 삭제는 아이템을 «소유자 없음»이 아니라 «없어짐»으로 처리하고(삭제 준비 함수), 법정 보관 기록을 따로 복사해 둔다 — 안내가 그 사실을 말하는지 확인한다.
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

describe('UserBulkImpactSummary — 삭제 안내', () => {
  const deleteBase = {
    targetCount: 2,
    excludedAdminCount: 0,
    excludedSelfCount: 0,
    badgeCount: 5,
    itemCount: 9,
    pointBalanceTotal: 1200,
    stravaConnectionCount: 1,
    vanishingItemCount: 8,
    retainedRecordCount: 14,
  }

  function renderDelete(impact: Record<string, number>): string {
    return renderToStaticMarkup(<UserBulkImpactSummary action="delete" impact={impact} skippedCount={0} />)
      .replace(/<!-- -->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  }

  it('아이템은 없어질 개수로 «없어짐으로 처리»라고 알린다(옛 «소유자 없음» 문구가 아니다)', () => {
    const t = renderDelete(deleteBase)
    expect(t).toContain('아이템 8개는 없어짐으로 처리돼요.')
    expect(t).not.toContain('소유자 없음')
  })

  it('보관 표로 복사되는 기록 수를 알린다', () => {
    expect(renderDelete(deleteBase)).toContain('방문·부정 이용 기록 14건은 법정 기간 동안 따로 보관돼요.')
  })

  it('값이 비어 있으면 0으로 보인다', () => {
    const t = renderDelete({ targetCount: 1, excludedAdminCount: 0, excludedSelfCount: 0 })
    expect(t).toContain('아이템 0개는 없어짐으로 처리돼요.')
    expect(t).toContain('방문·부정 이용 기록 0건')
  })
})
