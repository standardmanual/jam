/**
 * 유저 상세 «트라이브» 구역 — 서버 렌더 확인 (티켓 20261021_1247 3회)
 * 읽기 값 자체는 `lib/admin/__tests__/user-tribe-view.test.ts`가 고정하고, 변경 양식의 동작(미리 보기·확인창·확정·오류)은 `UserTribeChangeForm.test.tsx`가 고정한다.
 * 여기서는 읽은 값이 화면에 어떻게 그려지는지만 본다:
 * 지금 트라이브 이름, 트라이브가 없는 유저(안내 한 줄만, 변경 양식 없음), 변경 이력(KST 시각·옛→새 이름·사유·메모·처리자·취소된 미션 수),
 * 그리고 «이력 없음»과 «읽지 못함»의 구분.
 * jsdom이 없어(`environment: 'node'`) `renderToStaticMarkup`을 쓰고, 이어 붙은 글자 사이에 끼는 `<!-- -->`는 지운 글로 비교한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/admin/users/[id]/UserTribeSection.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// 변경 양식(클라이언트 컴포넌트)이 쓰는 라우터와, user-tribe.ts가 끌고 오는 알림 모듈
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn() }))

import { UserTribeSection } from './UserTribeSection'
import type { UserTribeView } from '@/lib/admin/user-tribe-view'
import type { TribeChangeHistoryItem } from '@/lib/admin/user-tribe'

const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function historyItem(overrides: Partial<TribeChangeHistoryItem> = {}): TribeChangeHistoryItem {
  return {
    id: 'c1',
    // UTC 2026-10-21 05:30 → KST 14:30
    createdAt: '2026-10-21T05:30:00+00:00',
    fromTribeId: 'f',
    fromTribeName: '낭만 미식가',
    toTribeId: 't',
    toTribeName: '아스팔트 레인저',
    reasonCode: 'user_request',
    reasonLabel: '유저가 옮기길 원해요',
    memo: '카톡으로 요청했어요',
    changedByEmail: 'ops@example.com',
    cancelledMissionCount: 2,
    ...overrides,
  }
}

function render(view: Partial<UserTribeView> = {}): string {
  const full: UserTribeView = {
    current: { ok: true, value: { id: 'f', name: '낭만 미식가' } },
    options: {
      ok: true,
      value: [
        { id: 'a', name: '아스팔트 레인저' },
        { id: 'b', name: '숲속의 갱단' },
      ],
    },
    history: { ok: true, value: [historyItem()] },
    ...view,
  }
  return renderToStaticMarkup(<UserTribeSection userId={USER} view={full} />).replace(/<!-- -->/g, '')
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('UserTribeSection — 트라이브가 있는 유저', () => {
  it('지금 트라이브 이름과 변경 양식이 보인다', () => {
    const html = render()
    const t = text(html)
    expect(t).toContain('지금 트라이브')
    expect(t).toContain('낭만 미식가')
    expect(html).toContain('aria-label="바꿀 트라이브"')
    expect(html).toContain('aria-label="사유"')
    expect(t).toContain('메모 (선택)')
    expect(t).toContain('트라이브 바꾸기')
    // 메모 상한은 lib 상수(200자)에서 온다
    expect(t).toContain('0/200')
    expect(html).toContain('maxLength="200"')
  })

  it('처음 상태에서는 «트라이브 바꾸기» 버튼이 잠겨 있다(바꿀 트라이브·사유를 고르기 전)', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>트라이브 바꾸기<\/button>/)
  })

  it('바꿀 수 있는 다른 활성 트라이브가 없으면 안내만 보이고 양식이 없다', () => {
    const html = render({ options: { ok: true, value: [] } })
    expect(text(html)).toContain('바꿀 수 있는 다른 활성 트라이브가 없어요')
    expect(html).not.toContain('aria-label="바꿀 트라이브"')
    expect(text(html)).not.toContain('트라이브 바꾸기')
  })

  it('바꿀 트라이브 목록을 읽지 못하면 «불러오지 못했어요»이고 양식이 없다', () => {
    const html = render({ options: { ok: false } })
    expect(text(html)).toContain('바꿀 수 있는 트라이브를 불러오지 못했어요')
    expect(text(html)).toContain('낭만 미식가')
    expect(html).not.toContain('aria-label="바꿀 트라이브"')
  })
})

describe('UserTribeSection — 트라이브가 없는 유저', () => {
  it('안내 한 줄만 보이고 변경 양식과 버튼이 없다', () => {
    const html = render({ current: { ok: true, value: null }, options: { ok: true, value: [] } })
    const t = text(html)
    expect(t).toContain('트라이브를 아직 고르지 않았어요. 유저가 직접 골라요.')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<textarea')
    expect(t).not.toContain('트라이브 바꾸기')
    expect(t).not.toContain('바꿀 트라이브')
    expect(t).not.toContain('읽지 못')
    expect(t).not.toContain('불러오지 못')
  })

  it('지금 트라이브를 읽지 못하면 «고르지 않았어요»가 아니라 «불러오지 못했어요»이고 양식이 없다', () => {
    const html = render({ current: { ok: false } })
    const t = text(html)
    expect(t).toContain('지금 트라이브를 불러오지 못했어요')
    expect(t).not.toContain('아직 고르지 않았어요')
    expect(html).not.toContain('<button')
  })
})

describe('UserTribeSection — 최근 변경 이력', () => {
  it('시각은 한국 표준시로, 옛 → 새 트라이브 이름·사유 이름·메모·처리자·취소된 미션 수를 보인다', () => {
    const t = text(render())
    expect(t).toContain('2026.10.21 14:30')
    expect(t).toContain('낭만 미식가 → 아스팔트 레인저')
    expect(t).toContain('유저가 옮기길 원해요')
    expect(t).toContain('카톡으로 요청했어요')
    expect(t).toContain('ops@example.com')
    expect(t).toContain('2개')
    expect(t).toContain('총 1건')
  })

  it('모르는 사유 코드는 코드 그대로 보인다(이력 항목의 라벨을 그대로 그린다)', () => {
    const t = text(render({ history: { ok: true, value: [historyItem({ reasonCode: 'old_code', reasonLabel: 'old_code' })] } }))
    expect(t).toContain('old_code')
  })

  it('메모가 없으면 «—», 처리자를 읽을 수 없으면 «알 수 없음», 트라이브 이름을 읽을 수 없으면 «알 수 없는 트라이브»다', () => {
    const t = text(
      render({
        history: {
          ok: true,
          value: [historyItem({ memo: null, changedByEmail: null, fromTribeName: null, cancelledMissionCount: 0 })],
        },
      })
    )
    expect(t).toContain('알 수 없음')
    expect(t).toContain('알 수 없는 트라이브 → 아스팔트 레인저')
    expect(t).toContain('0개')
    expect(t).toContain('—')
  })

  it('열 개가 모두 보이면 «최근 10건», 그보다 적으면 «총 N건»이다', () => {
    const ten = Array.from({ length: 10 }, (_, i) => historyItem({ id: `c${i}` }))
    expect(text(render({ history: { ok: true, value: ten } }))).toContain('최근 10건')
    expect(text(render({ history: { ok: true, value: ten.slice(0, 3) } }))).toContain('총 3건')
  })

  it('이력이 없으면 «아직 바꾼 적이 없어요»이고 읽기 실패 문구가 아니다', () => {
    const t = text(render({ history: { ok: true, value: [] } }))
    expect(t).toContain('아직 바꾼 적이 없어요')
    expect(t).not.toContain('불러오지 못')
  })

  it('이력을 읽지 못하면 «변경 이력을 불러오지 못했어요»이고 «아직 바꾼 적이 없어요»가 아니다', () => {
    const t = text(render({ history: { ok: false } }))
    expect(t).toContain('변경 이력을 불러오지 못했어요')
    expect(t).not.toContain('아직 바꾼 적이 없어요')
    // 다른 구역은 영향이 없다
    expect(t).toContain('낭만 미식가')
    expect(t).toContain('트라이브 바꾸기')
  })

  it('읽지 못한 구역이 여럿이어도 각자 문구가 나온다', () => {
    const t = text(render({ current: { ok: false }, history: { ok: false } }))
    expect(t).toContain('지금 트라이브를 불러오지 못했어요')
    expect(t).toContain('변경 이력을 불러오지 못했어요')
    expect(t).not.toContain('아직 바꾼 적이 없어요')
  })
})
