/**
 * 공유 버튼 위치 (티켓 20261110_0856, 사용자 지시 2026-11-10)
 *
 * TopNav 오른쪽의 공유 아이콘을 없애고, 3타입(아이템·체크인·활동) 상세의 콘텐츠 맨 끝에 전체 폭 «공유하기» 버튼을 둔다.
 * 본인 배지에서만 보이는 조건(`isOwnBadge`)은 그대로다.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { d } from '@/lib/i18n'

const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf-8')
const share = readFileSync(new URL('../BadgeShareButton.tsx', import.meta.url), 'utf-8')

describe('배지 상세의 공유 버튼 위치', () => {
  it('TopNav에 rightSlot으로 공유 버튼을 넘기지 않는다', () => {
    expect(page).not.toMatch(/rightSlot=\{[\s\S]{0,120}BadgeShareButton/)
  })

  it('3타입 모두 본인 배지일 때 맨 끝에 공유 버튼을 그린다', () => {
    const blocks = [...page.matchAll(/\{isOwnBadge && \(\s*(?:<div[^>]*>\s*)?<BadgeShareButton[\s\S]*?badgeType="(item|checkin|activity)"/g)]
    expect(blocks.map((m) => m[1]).sort()).toEqual(['activity', 'checkin', 'item'])
    expect(page.match(/<BadgeShareButton/g)).toHaveLength(3)
  })

  it('버튼 문구는 «공유하기»이고 아이콘 버튼(IconButton)을 더 쓰지 않는다', () => {
    expect(d.badges.shareButtonLabel).toBe('공유하기')
    expect(share).not.toContain('IconButton')
    expect(share).toContain('{d.badges.shareButtonLabel}')
  })

  it('막힌 사유는 네이티브 disabled가 아니라 aria-disabled로 알려 눌러야 안내가 뜬다', () => {
    expect(share).toContain('aria-disabled={isDisabled || undefined}')
    expect(share).not.toMatch(/<Button[^>]*\sdisabled=/)
  })
})
