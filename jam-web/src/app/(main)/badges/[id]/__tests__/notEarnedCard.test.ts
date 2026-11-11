/**
 * 배지 상세의 미획득 안내 카드 — 보조 문구 «조건을 달성하면 자동으로 획득돼요»를 쓰지 않는다 (2026-11-09 사용자 지시)
 *
 * 카드는 제목 «아직 획득하지 못한 배지예요» 한 줄만 둔다. 활동·체크인·아이템 배지 상세 세 갈래가 같다.
 * 공유 시트의 비활성 안내(`BadgeShareButton`)도 같은 날 같은 지시로 본문 없이 제목만 둔다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/notEarnedCard.test.ts"
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf-8')
const share = readFileSync(new URL('../BadgeShareButton.tsx', import.meta.url), 'utf-8')

describe('배지 상세 미획득 안내 카드', () => {
  it('세 갈래 모두 제목만 그리고 보조 문구(notEarnedBody)를 그리지 않는다', () => {
    expect(page.split('d.badges.notEarnedTitle').length - 1).toBe(3)
    expect(page).not.toContain('notEarnedBody')
  })

  it('제목 아래에 다른 문단이 붙지 않는다', () => {
    const blocks = [...page.matchAll(/d\.badges\.notEarnedTitle\}<\/p>\s*<\/Card>/g)]
    expect(blocks).toHaveLength(3)
  })

  it('공유 시트의 미획득 안내도 본문 없이 제목만 그린다', () => {
    expect(share).not.toContain('notEarnedBody')
    // 안내 팝오버는 미획득 하나뿐이라(스트라바 끊김은 공유를 막지 않는다, 티켓 20261111_0801) 제목만 그린다
    expect(share).toContain('{d.badges.notEarnedTitle}')
  })
})
