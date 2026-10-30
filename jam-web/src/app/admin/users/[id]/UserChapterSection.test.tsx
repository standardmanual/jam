/**
 * 유저 상세 «챕터» 구역 — 서버 렌더 확인 (티켓 20261019_1318 2회)
 * 읽기 값 자체는 `lib/admin/__tests__/user-chapter-view.test.ts`가 고정한다. 여기서는 그 값이 화면에 어떻게 그려지는지만 본다:
 * 챕터와 점수 숫자(어드민에게만), 오른 기록(KST 시각), 그리고 «기록 없음»과 «읽지 못함»의 구분.
 * 챕터는 숫자로만 표기한다(2026-10-21 결정): 이름 열과 이름 안내 문구가 없다.
 * jsdom이 없어(`environment: 'node'`) `renderToStaticMarkup`을 쓰고, 이어 붙은 글자 사이에 끼는 `<!-- -->`는 지운 글로 비교한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/admin/users/[id]/UserChapterSection.test.tsx"
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UserChapterSection } from './UserChapterSection'
import type { UserChapterView } from '@/lib/admin/user-chapter-view'

function render(view: Partial<UserChapterView> = {}): string {
  const full: UserChapterView = {
    current: { ok: true, value: { chapterNo: 3, totalScore: 2450 } },
    ups: {
      ok: true,
      value: [
        { chapterNo: 1, reachedAt: '2026-09-01T00:00:00+00:00' },
        { chapterNo: 3, reachedAt: '2026-10-15T20:30:00+00:00' },
      ],
    },
    ...view,
  }
  return renderToStaticMarkup(<UserChapterSection view={full} />).replace(/<!-- -->/g, '')
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('UserChapterSection — 정상', () => {
  it('지금 챕터와 누적 점수 숫자를 보인다(어드민에게는 점수 숫자가 허용된다)', () => {
    const t = text(render())
    expect(t).toContain('챕터 3')
    expect(t).not.toContain('챕터 3 ·')
    expect(t).toContain('누적 점수')
    expect(t).toContain('2,450점')
  })

  it('오른 기록의 오른 시각은 한국 표준시로 보인다(UTC 20:30은 다음 날 05:30)', () => {
    const t = text(render())
    expect(t).toContain('챕터 1')
    expect(t).toContain('2026.10.16 05:30')
    expect(t).toContain('2026.09.01 09:00')
  })

  it('점수 기록 표는 없다 — 활동 이름·주간 상한 표기가 나오지 않는다', () => {
    const t = text(render())
    expect(t).not.toContain('점수 기록')
    expect(t).not.toContain('주간 상한')
  })
})

describe('UserChapterSection — 기록 없음', () => {
  it('챕터가 없는 유저는 «챕터 없음»이고 쌓인 점수를 보인다', () => {
    const t = text(render({ current: { ok: true, value: { chapterNo: null, totalScore: 120 } } }))
    expect(t).toContain('챕터 없음')
    expect(t).toContain('120점')
  })

  it('오른 기록이 비어 있으면 «없어요» 문구이고 읽기 실패 문구가 아니다', () => {
    const t = text(render({ ups: { ok: true, value: [] } }))
    expect(t).toContain('아직 오른 기록이 없어요')
    expect(t).not.toContain('읽지 못했어요')
  })

  it('이름 열과 이름 안내 문구가 없다 — 오른 기록 표는 챕터와 오른 시각 두 열이다', () => {
    const html = render()
    const t = text(html)
    expect(t).not.toContain('이름')
    expect(t).not.toContain('트라이브')
    expect(html.match(/<th /g)).toHaveLength(2)
  })
})

describe('UserChapterSection — 읽지 못함은 기록 없음과 다르게 보인다', () => {
  it('읽지 못한 구역만 읽기 실패 문구가 나온다', () => {
    const t = text(render({ ups: { ok: false } }))
    expect(t).toContain('오른 기록을 읽지 못했어요')
    expect(t).not.toContain('아직 오른 기록이 없어요')
    expect(t).not.toContain('지금 챕터를 읽지 못했어요')
    expect(t).toContain('챕터 3')
  })

  it('두 구역 모두 읽지 못하면 두 문구가 나오고 «없어요» 문구는 없다', () => {
    const t = text(render({ current: { ok: false }, ups: { ok: false } }))
    expect(t).toContain('지금 챕터를 읽지 못했어요')
    expect(t).toContain('오른 기록을 읽지 못했어요')
    expect(t).not.toContain('없어요')
  })
})
