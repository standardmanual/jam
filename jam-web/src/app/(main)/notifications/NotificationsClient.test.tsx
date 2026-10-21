/**
 * 소식 화면의 챕터 오름·미션 참가 취소 소식 (티켓 20261019_1317 3회, 운영 로직 12.1절·5-3 참가 취소 소식)
 *
 * 고정하는 것
 *  - `chapter_up`: 문구 «축하해요! 챕터 N에 올랐어요»(챕터 번호만 굵게), 누르면 내 프로필(`/{username}`, 아이디가 없으면 `/profile`), 아이콘은 메달.
 *  - `mission_participation_cancelled`: 문구 «트라이브가 바뀌어 「…」 미션 참가가 취소됐어요»(여러 개면 «미션 N개 참가가 취소됐어요»),
 *    누르면 미션 목록(`/missions`, 단건이어도 상세로 가지 않는다), 아이콘은 과녁.
 *  - 두 종류의 아이콘 마크업이 서로 다르고, 행위자 아바타·경고 칸으로 바뀌지 않는다.
 *  - `tribe_changed`(티켓 20261021_1247): 문구 «트라이브가 바뀌었어요. 이제 {이름} 소속이에요. …»(트라이브 이름만 굵게), 누르면 `/profile`, 아이콘은 사람들(`UsersIcon`).
 *  - 소식이 없을 때와 읽지 못했을 때는 서로 다른 안내가 보이고, 어느 쪽에도 어드민 용어 «회수»가 없다.
 *
 * 아이콘은 화면이 쓰는 아이콘 컴포넌트(`MedalIcon`·`TargetIcon`)를 같은 클래스로 따로 그린 마크업과 견준다 — 제품 코드에 시험용 표지를 넣지 않는다.
 * 문구와 착지 계산(`message.ts`·`href.ts`) 자체는 `lib/notifications/__tests__/message-href.test.ts`가 고정한다. 여기서는 화면이 그 결과를 제대로 잇는지 본다.
 * 참가 취소 소식은 호출처가 묶음 6에 있어 아직 실제로 만들어지지 않는다(화면이 받을 준비가 됐는지만 확인한다).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/notifications/NotificationsClient.test.tsx"
 */
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/TopNav', () => ({
  default: ({ title }: { title?: string }) => <header data-testid="top-nav">{title}</header>,
}))

import NotificationsClient from './NotificationsClient'
import { MedalIcon, TargetIcon, UsersIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { NotificationView } from '@/lib/notifications/message'
import type { NotificationType } from '@/types/database'

const NOW = '2026-10-21T03:00:00.000Z'
const ME = { id: 'me', username: 'runner', avatarUrl: null }

function view(type: NotificationType, payload: Record<string, unknown>, extra: Partial<NotificationView> = {}): NotificationView {
  return {
    id: `n-${type}`,
    type,
    payload,
    actorCount: 0,
    actor: null,
    actor2: null,
    me: ME,
    updatedAt: '2026-10-21T02:00:00.000Z',
    warning: false,
    ...extra,
  }
}

function render(items: NotificationView[], over: { initialFailed?: boolean; seenAtSnapshot?: string | null } = {}): string {
  return renderToStaticMarkup(
    <NotificationsClient
      initialItems={items}
      initialCursor={null}
      initialFailed={over.initialFailed ?? false}
      seenAtSnapshot={over.seenAtSnapshot ?? null}
    />
  )
}

/** 화면이 아이콘 칸에 쓰는 클래스 그대로 따로 그린 아이콘 마크업 */
function icon(Component: (props: { className?: string }) => ReactNode): string {
  return renderToStaticMarkup(<Component className="w-5 h-5 text-foreground" />)
}

/** 첫 번째 링크의 착지 주소 — 행 전체(또는 본문)가 링크다 */
function linkOf(html: string): string {
  const match = html.match(/<a [^>]*href="([^"]*)"/)
  return match ? match[1] : ''
}

/** 태그를 걷어낸 화면 글자 — 굵은 글자(`<strong>`)가 문장 가운데 있어도 문장이 이어진 채 읽힌다 */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

const CHAPTER_UP = view('chapter_up', { chapter_no: 3 })
const ONE_CANCELLED = view('mission_participation_cancelled', { missions: [{ mission_id: 'm1', title: '한강 100km' }] })
const MANY_CANCELLED = view('mission_participation_cancelled', {
  missions: [
    { mission_id: 'm1', title: '한강 100km' },
    { mission_id: 'm2', title: '남산 오르기' },
    { mission_id: 'm3', title: '주말 러닝' },
  ],
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('아이콘 마크업 전제', () => {
  it('메달과 과녁은 서로 다른 그림이다 — 아래 구분 시험이 의미가 있다', () => {
    expect(icon(MedalIcon)).not.toBe(icon(TargetIcon))
  })
})

describe('챕터 오름 소식 (chapter_up)', () => {
  it('«축하해요! 챕터 3에 올랐어요»로 읽히고 챕터 번호만 굵게 보인다', () => {
    const html = render([CHAPTER_UP])

    expect(visibleText(html)).toContain('축하해요! 챕터 3에 올랐어요')
    expect(html).toContain('<strong class="font-bold">챕터 3</strong>')
    expect((html.match(/<strong/g) ?? []).length).toBe(1)
  })

  it('누르면 내 프로필로 간다', () => {
    expect(linkOf(render([CHAPTER_UP]))).toBe('/runner')
  })

  it('아이디가 없으면 /profile로 간다', () => {
    const noName = view('chapter_up', { chapter_no: 3 }, { me: { id: 'me', username: null, avatarUrl: null } })

    expect(linkOf(render([noName]))).toBe('/profile')
  })

  it('아이콘은 메달이고 과녁이 아니다', () => {
    const html = render([CHAPTER_UP])

    expect(html).toContain(icon(MedalIcon))
    expect(html).not.toContain(icon(TargetIcon))
  })

  it('경고 칸이나 행위자 아바타가 아니라 종류별 아이콘 칸으로 그려진다', () => {
    const html = render([CHAPTER_UP])

    expect(html).not.toContain(`aria-label="${d.notifications.warningLabel}"`)
    expect(html).not.toContain(d.profile.avatarAlt)
    expect(html).not.toContain('bg-warning')
  })

  it('번호가 손상됐으면 번호 없는 문장으로 보인다', () => {
    const html = render([view('chapter_up', { chapter_no: 0 })])

    expect(visibleText(html)).toContain('축하해요! 챕터가 올랐어요')
    expect(visibleText(html)).not.toContain('챕터 0')
  })

  it('상대 시간이 함께 보인다', () => {
    expect(visibleText(render([CHAPTER_UP]))).toContain('1시간 전')
  })
})

describe('미션 참가 취소 소식 (mission_participation_cancelled)', () => {
  it('한 개면 미션 이름을 말하고 이름만 굵게 보인다', () => {
    const html = render([ONE_CANCELLED])

    expect(visibleText(html)).toContain('트라이브가 바뀌어 「한강 100km」 미션 참가가 취소됐어요')
    expect(html).toContain('<strong class="font-bold">한강 100km</strong>')
    expect((html.match(/<strong/g) ?? []).length).toBe(1)
  })

  it('여러 개면 개수로 접어 말한다', () => {
    const html = render([MANY_CANCELLED])

    expect(visibleText(html)).toContain('트라이브가 바뀌어 미션 3개 참가가 취소됐어요')
    expect(visibleText(html)).not.toContain('한강 100km')
  })

  it('한 개여도 상세가 아니라 미션 목록으로 간다(대상이 아닌 미션의 상세는 404다)', () => {
    expect(linkOf(render([ONE_CANCELLED]))).toBe('/missions')
    expect(linkOf(render([MANY_CANCELLED]))).toBe('/missions')
    expect(render([ONE_CANCELLED])).not.toContain('/missions/m1')
  })

  it('아이콘은 과녁이고 메달이 아니다', () => {
    const html = render([ONE_CANCELLED])

    expect(html).toContain(icon(TargetIcon))
    expect(html).not.toContain(icon(MedalIcon))
  })

  it('경고 칸이나 행위자 아바타가 아니라 종류별 아이콘 칸으로 그려진다', () => {
    const html = render([ONE_CANCELLED])

    expect(html).not.toContain(`aria-label="${d.notifications.warningLabel}"`)
    expect(html).not.toContain(d.profile.avatarAlt)
  })

  it('제목이 비어도 「」만 남는 문장이 보이지 않는다', () => {
    const html = render([view('mission_participation_cancelled', { missions: [{ mission_id: 'm1', title: '' }] })])

    expect(visibleText(html)).toContain('트라이브가 바뀌어 미션 1개 참가가 취소됐어요')
    expect(html).not.toContain('「」')
  })
})

describe('어드민 트라이브 변경 소식 (tribe_changed, 티켓 20261021_1247)', () => {
  const TRIBE_CHANGED = view('tribe_changed', { new_tribe_name: '아스팔트 레인저' })

  it('바뀐 사실과 새 소속을 말하고 트라이브 이름만 굵게 보인다', () => {
    const html = render([TRIBE_CHANGED])

    expect(visibleText(html)).toContain('트라이브가 바뀌었어요. 이제 아스팔트 레인저 소속이에요. 이미 가진 배지와 잼, 챕터는 그대로예요')
    expect(html).toContain('<strong class="font-bold">아스팔트 레인저</strong>')
    expect((html.match(/<strong/g) ?? []).length).toBe(1)
  })

  it('누르면 /profile로 간다 — 아이디가 있어도 같다', () => {
    expect(linkOf(render([TRIBE_CHANGED]))).toBe('/profile')
  })

  it('아이콘은 사람들이고 메달·과녁이 아니다', () => {
    const html = render([TRIBE_CHANGED])

    expect(html).toContain(icon(UsersIcon))
    expect(html).not.toContain(icon(MedalIcon))
    expect(html).not.toContain(icon(TargetIcon))
  })

  it('경고 칸이나 행위자 아바타가 아니라 종류별 아이콘 칸으로 그려진다', () => {
    const html = render([TRIBE_CHANGED])

    expect(html).not.toContain(`aria-label="${d.notifications.warningLabel}"`)
    expect(html).not.toContain(d.profile.avatarAlt)
    expect(html).not.toContain('bg-warning')
  })

  it('알림함이 모르는 종류로 보지 않는다', () => {
    expect(visibleText(render([TRIBE_CHANGED]))).not.toContain(d.notifications.unknown)
  })
})

describe('두 소식이 함께 있을 때', () => {
  it('각 행이 자기 착지와 자기 아이콘을 가진다', () => {
    const html = render([CHAPTER_UP, ONE_CANCELLED])

    const links = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])
    expect(links).toEqual(['/runner', '/missions'])
    // 각각 한 번씩만 그려진다
    expect(html.split(icon(MedalIcon)).length - 1).toBe(1)
    expect(html.split(icon(TargetIcon)).length - 1).toBe(1)
    // 메달 행이 과녁 행보다 앞이다(받은 순서 그대로)
    expect(html.indexOf(icon(MedalIcon))).toBeLessThan(html.indexOf(icon(TargetIcon)))
  })

  it('읽음 시각 뒤에 온 소식 수만큼 «새 소식» 구분선이 한 번 그려진다', () => {
    const later = view('chapter_up', { chapter_no: 4 }, { id: 'n-new', updatedAt: '2026-10-21T02:30:00.000Z' })
    const earlier = view('mission_participation_cancelled', { missions: [{ mission_id: 'm1', title: '한강 100km' }] }, { id: 'n-old', updatedAt: '2026-10-20T00:00:00.000Z' })

    const html = render([later, earlier], { seenAtSnapshot: '2026-10-21T01:00:00.000Z' })

    expect(visibleText(html)).toContain(t(d.notifications.newDivider, { count: 1 }))
    expect(visibleText(html).split(t(d.notifications.newDivider, { count: 1 })).length - 1).toBe(1)
  })
})

describe('소식이 없을 때와 읽지 못했을 때', () => {
  it('소식이 없으면 빈 상태 안내가 보이고 오류 안내는 없다', () => {
    const html = render([])

    expect(visibleText(html)).toContain(d.notifications.emptyTitle)
    expect(visibleText(html)).not.toContain(d.notifications.errorTitle)
    expect(visibleText(html)).not.toContain('회수')
  })

  it('읽지 못했으면 오류 안내와 «다시 시도»가 보이고 빈 상태로 보이지 않는다', () => {
    const html = render([], { initialFailed: true })

    expect(visibleText(html)).toContain(d.notifications.errorTitle)
    expect(visibleText(html)).toContain(d.notifications.retry)
    expect(visibleText(html)).not.toContain(d.notifications.emptyTitle)
    expect(visibleText(html)).not.toContain('회수')
  })

  it('챕터 오름·참가 취소 소식 문구에 어드민 용어 «회수»가 없다', () => {
    const html = render([CHAPTER_UP, ONE_CANCELLED, MANY_CANCELLED])

    expect(html).not.toContain('회수')
  })
})
