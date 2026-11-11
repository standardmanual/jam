import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AchievementRow } from './MissionStatusClient'

interface AchievementEntryLike {
  userId: string
  displayName: string
  username: string | null
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

// 티켓 20261107_1947 — 달성 행을 `ListRow`로 옮겼다. `ListRow`는 행마다 `<style>`을 내보내므로 먼저 걷고 검사한다(티켓 20261107_1815).
const entry: AchievementEntryLike = { userId: 'u1', displayName: '러너', username: 'runner', avatarUrl: null, achieved: true, achievedAt: null }
const render = (e: Partial<AchievementEntryLike>) =>
  renderToStaticMarkup(<AchievementRow e={{ ...entry, ...e }} />).replace(/<style[\s\S]*?<\/style>/g, '')

describe('AchievementRow', () => {
  it('행 전체가 프로필 링크이고 링크 안에 <div>·<p>가 없다', () => {
    const html = render({})
    const inner = html.match(/<a [^>]*href="\/runner"[^>]*>(.*?)<\/a>/)?.[1] ?? ''
    expect(inner).toContain('러너')
    expect(inner).not.toContain('<div')
    expect(inner).not.toMatch(/<p[ >]/)
  })

  it('username이 없으면 링크 없는 행이다', () => {
    const html = render({ username: null })
    expect(html).not.toContain('<a ')
    expect(html).toContain('data-interactive="false"')
  })

  it('달성·미달성은 value 칩이다(달성은 done 블랙 면, 미달성은 --muted 면 + --snow 글자)', () => {
    expect(render({ achieved: true })).toContain('background:var(--foreground);color:var(--snow)')
    expect(render({ achieved: true })).toContain('>달성</span>')
    expect(render({ achieved: false })).toContain('background:var(--muted);color:var(--snow)')
    expect(render({ achieved: false })).not.toContain('border-radius:var(--radius-full);background:var(--surface);color:var(--muted);font-size')
    expect(render({ achieved: false })).toContain('>미달성</span>')
  })

  it('«나» 칩이 없다 — 내 상태는 위쪽 «나» 영역이 알린다 (티켓 20261111_2049)', () => {
    const html = render({})
    expect(html).not.toContain('>나</span>')
    expect(html).not.toContain('(나)')
    expect(html).not.toContain('var(--link)')
  })

  it('36 고정 아바타·!py-2·리터럴 색이 없다', () => {
    const html = render({})
    expect(html).not.toContain('w-9')
    expect(html).not.toContain('!py-2')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(html).not.toContain('accent-content-green')
  })

  it('아바타 이미지는 장식(alt="")이고 없으면 아이콘이다', () => {
    expect(render({ avatarUrl: 'https://example.com/a.png' })).toContain('<img src="https://example.com/a.png" alt=""/>')
    const none = render({})
    expect(none).not.toContain('<img')
    expect(none).toContain('<svg')
  })
})
