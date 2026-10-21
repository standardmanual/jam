/**
 * 유저 상세 «챕터» 구역 — 서버 렌더 확인 (티켓 20261019_1318 2회)
 * 읽기 값 자체는 `lib/admin/__tests__/user-chapter-view.test.ts`가 고정한다. 여기서는 그 값이 화면에 어떻게 그려지는지만 본다:
 * 챕터와 이름과 점수 숫자(어드민에게만), 오른 기록(KST 시각), 점수 기록과 주간 상한 표기, 그리고 «기록 없음»과 «읽지 못함»의 구분.
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
    current: { ok: true, value: { chapterNo: 3, totalScore: 2450, name: '단골' } },
    ups: {
      ok: true,
      value: [
        { chapterNo: 1, reachedAt: '2026-09-01T00:00:00+00:00', name: '새내기' },
        { chapterNo: 3, reachedAt: '2026-10-15T20:30:00+00:00', name: '단골' },
      ],
    },
    scoreEvents: {
      ok: true,
      value: {
        total: 120,
        rows: [
          { id: 'e2', kind: 'capsule_open', kindLabel: '캡슐 열기', occurredOn: '2026-10-20', createdAt: '2026-10-20T01:00:00+00:00', unitAmount: 1, rawScore: 20, countedScore: 20 },
          { id: 'e1', kind: 'jam_earned', kindLabel: '모은 잼', occurredOn: '2026-10-19', createdAt: '2026-10-19T01:00:00+00:00', unitAmount: 400, rawScore: 400, countedScore: 350 },
        ],
      },
    },
    namesFailed: false,
    ...view,
  }
  return renderToStaticMarkup(<UserChapterSection view={full} />).replace(/<!-- -->/g, '')
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('UserChapterSection — 정상', () => {
  it('지금 챕터와 이름과 누적 점수 숫자를 보인다(어드민에게는 점수 숫자가 허용된다)', () => {
    const t = text(render())
    expect(t).toContain('챕터 3 · 단골')
    expect(t).toContain('누적 점수')
    expect(t).toContain('2,450점')
  })

  it('오른 기록의 오른 시각은 한국 표준시로 보인다(UTC 20:30은 다음 날 05:30)', () => {
    const t = text(render())
    expect(t).toContain('챕터 1')
    expect(t).toContain('새내기')
    expect(t).toContain('2026.10.16 05:30')
    expect(t).toContain('2026.09.01 09:00')
  })

  it('점수 기록은 활동 이름과 상한 전·센 점수를 보이고, 센 점수가 줄었을 때만 «주간 상한»을 붙인다', () => {
    const html = render()
    const t = text(html)
    expect(t).toContain('캡슐 열기')
    expect(t).toContain('모은 잼')
    expect(t).toContain('최근 2건 · 전체 120건')
    // 모은 잼 400 → 350: 상한 표기 한 번만
    expect(html.match(/\(주간 상한\)/g)).toHaveLength(1)
    expect(html.indexOf('(주간 상한)')).toBeGreaterThan(html.indexOf('모은 잼'))
    expect(t).toContain('2026.10.19')
  })

  it('전체 건수가 보인 건수와 같으면 «총 N건»이다', () => {
    const t = text(
      render({
        scoreEvents: {
          ok: true,
          value: { total: 1, rows: [{ id: 'e', kind: 'drop', kindLabel: '드랍', occurredOn: '2026-10-20', createdAt: '2026-10-20T01:00:00+00:00', unitAmount: 1, rawScore: 5, countedScore: 5 }] },
        },
      })
    )
    expect(t).toContain('총 1건')
    expect(t).not.toContain('전체')
  })
})

describe('UserChapterSection — 기록 없음', () => {
  it('챕터가 없는 유저는 «챕터 없음»이고 쌓인 점수를 보인다', () => {
    const t = text(render({ current: { ok: true, value: { chapterNo: null, totalScore: 120, name: null } } }))
    expect(t).toContain('챕터 없음')
    expect(t).toContain('120점')
  })

  it('오른 기록과 점수 기록이 비어 있으면 «없어요» 문구이고 읽기 실패 문구가 아니다', () => {
    const t = text(render({ ups: { ok: true, value: [] }, scoreEvents: { ok: true, value: { rows: [], total: 0 } } }))
    expect(t).toContain('아직 오른 기록이 없어요')
    expect(t).toContain('아직 쌓인 점수 기록이 없어요')
    expect(t).not.toContain('읽지 못했어요')
  })

  it('이름이 없으면 이유를 적는다 — 이름 표가 비어 있을 때와 읽지 못했을 때가 다르다', () => {
    const empty = text(render({ current: { ok: true, value: { chapterNo: 2, totalScore: 10, name: null } } }))
    expect(empty).toContain('이 트라이브에는 이 챕터의 이름이 아직 없어요')
    const failed = text(render({ current: { ok: true, value: { chapterNo: 2, totalScore: 10, name: null } }, namesFailed: true }))
    expect(failed).toContain('챕터 이름을 읽지 못했어요')
    expect(failed).not.toContain('이름이 아직 없어요')
  })
})

describe('UserChapterSection — 읽지 못함은 기록 없음과 다르게 보인다', () => {
  it('읽지 못한 구역만 읽기 실패 문구가 나온다', () => {
    const t = text(render({ ups: { ok: false } }))
    expect(t).toContain('오른 기록을 읽지 못했어요')
    expect(t).not.toContain('아직 오른 기록이 없어요')
    expect(t).not.toContain('지금 챕터를 읽지 못했어요')
    expect(t).toContain('챕터 3 · 단골')
  })

  it('세 구역 모두 읽지 못하면 세 문구가 나오고 «없어요» 문구는 없다', () => {
    const t = text(render({ current: { ok: false }, ups: { ok: false }, scoreEvents: { ok: false } }))
    expect(t).toContain('지금 챕터를 읽지 못했어요')
    expect(t).toContain('오른 기록을 읽지 못했어요')
    expect(t).toContain('점수 기록을 읽지 못했어요')
    expect(t).not.toContain('없어요')
  })
})
