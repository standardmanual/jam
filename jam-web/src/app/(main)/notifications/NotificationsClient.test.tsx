/**
 * 소식 화면의 챕터 오름·미션 참가 취소 소식 (티켓 20261019_1317 3회, 운영 로직 12.1절·5-3 참가 취소 소식)
 *
 * 고정하는 것
 *  - `chapter_up`: 문구 «축하해요! 챕터 N에 올랐어요»(챕터 번호만 굵게), 누르면 내 프로필(`/{username}`, 아이디가 없으면 `/profile`), 아이콘은 메달.
 *  - `mission_participation_cancelled`: 문구 «트라이브가 바뀌어 「…」 미션 참가가 취소됐어요»(여러 개면 «미션 N개 참가가 취소됐어요»),
 *    누르면 미션 목록(`/missions`, 단건이어도 상세로 가지 않는다), 아이콘은 과녁.
 *  - 두 종류의 아이콘 마크업이 서로 다르고, 행위자 아바타·경고 칸으로 바뀌지 않는다.
 *  - `tribe_changed`(티켓 20261021_1247): 문구 «트라이브가 바뀌었어요. 이제 {이름} 소속이에요. …»(트라이브 이름만 굵게), 누르면 `/profile`, 아이콘은 사람들(`UsersIcon`).
 *  - `suspension_started`·`suspension_lifted`·`reward_pending`(티켓 20261021_1249 6-3 5회): 문구 «이용이 정지됐어요. …»·«이용 정지가 해제됐어요. …»·«{미션 제목}에서 받을 보상이 있어요. …»(미션 제목만 굵게),
 *    누르면 각각 홈(`/`)·홈(`/`)·그 미션 상세(미션 id가 비면 `/missions`), 아이콘은 자물쇠·체크 원·선물이고 세 종류 모두 경고면(`bg-warning`)이 아니라 일반 타일이다.
 *  - 소식이 없을 때와 읽지 못했을 때는 서로 다른 안내가 보이고, 어느 쪽에도 어드민 용어 «회수»가 없다.
 *
 * 아이콘은 화면이 쓰는 아이콘 컴포넌트(`MedalIcon`·`TargetIcon`)를 같은 클래스로 따로 그린 마크업과 견준다 — 제품 코드에 시험용 표지를 넣지 않는다.
 * 문구와 착지 계산(`message.ts`·`href.ts`) 자체는 `lib/notifications/__tests__/message-href.test.ts`가 고정한다. 여기서는 화면이 그 결과를 제대로 잇는지 본다.
 * 참가 취소 소식과 트라이브 변경 소식(`tribe_changed`)을 만드는 곳은 어드민 트라이브 변경(`lib/admin/user-tribe.ts`)이라, 마이그레이션 258~261이 공용 DB에 적용되기 전에는 실제로 만들어지지 않는다(화면이 받을 준비가 됐는지만 확인한다).
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
import { CheckCircleIcon, GiftIcon, LockIcon, MedalIcon, TargetIcon, UsersIcon } from '@/components/ui/icons'
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

describe('이용 정지 소식 (suspension_started, 티켓 20261021_1249 6-3 5회)', () => {
  const STARTED = view('suspension_started', { suspension_id: 's1', suspended_at: '2026-10-21T01:00:00.000Z' })

  it('정지됐다는 사실과 문의로 가는 길을 말한다 — 볼드 슬롯이 없다', () => {
    const html = render([STARTED])

    expect(visibleText(html)).toContain('이용이 정지됐어요. 정지 사유와 해제 방법은 문의로 알려 드려요')
    expect(html).not.toContain('<strong')
  })

  it('누르면 홈으로 간다 — 사유와 문의 버튼은 홈 정지 안내 배너에 있다', () => {
    expect(linkOf(render([STARTED]))).toBe('/')
  })

  it('아이콘은 자물쇠이고 다른 종류의 아이콘이 아니다', () => {
    const html = render([STARTED])

    expect(html).toContain(icon(LockIcon))
    expect(html).not.toContain(icon(CheckCircleIcon))
    expect(html).not.toContain(icon(GiftIcon))
  })

  it('경고면이나 행위자 아바타가 아니라 일반 아이콘 타일로 그려진다', () => {
    const html = render([STARTED])

    expect(html).toContain('w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center')
    expect(html).not.toContain(`aria-label="${d.notifications.warningLabel}"`)
    expect(html).not.toContain(d.profile.avatarAlt)
    expect(html).not.toContain('bg-warning')
  })

  it('payload에 사유·어드민 이메일이 섞여 들어와도 화면에 나오지 않는다', () => {
    const html = render([view('suspension_started', { suspension_id: 's1', reason: '부정 이용 의심', suspended_by: 'admin@j-a-m.app' })])

    expect(html).not.toContain('부정 이용 의심')
    expect(html).not.toContain('admin@')
  })

  it('알림함이 모르는 종류로 보지 않는다', () => {
    expect(visibleText(render([STARTED]))).not.toContain(d.notifications.unknown)
  })
})

describe('이용 정지 해제 소식 (suspension_lifted, 티켓 20261021_1249 6-3 5회)', () => {
  const LIFTED = view('suspension_lifted', { suspension_id: 's1', lifted_at: '2026-10-21T02:00:00.000Z' })

  it('해제됐다는 사실과 다시 할 수 있는 일을 말한다', () => {
    const html = render([LIFTED])

    expect(visibleText(html)).toContain('이용 정지가 해제됐어요. 이제 동기화하고 아이템 배지를 획득할 수 있어요')
    expect(html).not.toContain('<strong')
  })

  it('누르면 홈으로 간다', () => {
    expect(linkOf(render([LIFTED]))).toBe('/')
  })

  it('아이콘은 체크 원이고 자물쇠가 아니다', () => {
    const html = render([LIFTED])

    expect(html).toContain(icon(CheckCircleIcon))
    expect(html).not.toContain(icon(LockIcon))
  })

  it('경고면이나 행위자 아바타가 아니라 일반 아이콘 타일로 그려진다', () => {
    const html = render([LIFTED])

    expect(html).toContain('w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center')
    expect(html).not.toContain(`aria-label="${d.notifications.warningLabel}"`)
    expect(html).not.toContain(d.profile.avatarAlt)
    expect(html).not.toContain('bg-warning')
  })
})

describe('받지 않은 보상 소식 (reward_pending, 티켓 20261021_1249 6-3 5회)', () => {
  const PENDING = view('reward_pending', { mission_id: 'm1', mission_title: '한강 100km' })

  it('미션 제목을 굵게 말하고 받지 못한 까닭을 알린다', () => {
    const html = render([PENDING])

    expect(visibleText(html)).toContain('한강 100km에서 받을 보상이 있어요. 인벤토리 빈칸이 모자라 아직 받지 못했어요')
    expect(html).toContain('<strong class="font-bold">한강 100km</strong>')
    expect((html.match(/<strong/g) ?? []).length).toBe(1)
  })

  it('누르면 그 미션 상세로 간다', () => {
    expect(linkOf(render([PENDING]))).toBe('/missions/m1')
  })

  it('미션 id가 비었으면 미션 목록으로 간다', () => {
    expect(linkOf(render([view('reward_pending', { mission_title: '한강 100km' })]))).toBe('/missions')
  })

  it('미션 제목이 비었으면 제목 없는 문장으로 보이고 볼드 슬롯이 없다', () => {
    const html = render([view('reward_pending', { mission_id: 'm1', mission_title: '' })])

    expect(visibleText(html)).toContain('받을 보상이 있어요. 인벤토리 빈칸이 모자라 아직 받지 못했어요')
    expect(visibleText(html)).not.toContain('에서 받을 보상이')
    expect(html).not.toContain('<strong')
    expect(linkOf(html)).toBe('/missions/m1')
  })

  it('아이콘은 선물이고 자물쇠·체크 원이 아니다', () => {
    const html = render([PENDING])

    expect(html).toContain(icon(GiftIcon))
    expect(html).not.toContain(icon(LockIcon))
    expect(html).not.toContain(icon(CheckCircleIcon))
  })

  it('경고면이나 행위자 아바타가 아니라 일반 아이콘 타일로 그려진다', () => {
    const html = render([PENDING])

    expect(html).toContain('w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center')
    expect(html).not.toContain(`aria-label="${d.notifications.warningLabel}"`)
    expect(html).not.toContain(d.profile.avatarAlt)
    expect(html).not.toContain('bg-warning')
  })
})

describe('캡슐 소식 (capsule_nearly_full·capsule_jam_blocked, 티켓 20261028_1734 3회)', () => {
  const NEARLY = view('capsule_nearly_full', { stage: 80 })
  const BLOCKED = view('capsule_jam_blocked', {})

  it('단계 소식은 퍼센트만 굵게 말하고 가득 차면 잼을 받을 수 없다는 사실과 받기를 알린다', () => {
    const html = render([NEARLY])

    expect(visibleText(html)).toContain('캡슐이 80% 찼어요. 받지 못한 보상이 있어서 이 캡슐이 가득 차면 잼을 받을 수 없게 돼요')
    expect(visibleText(html)).toContain('받기로 보상을 받으면 계속 잼을 받을 수 있어요')
    expect(html).toContain('<strong class="font-bold">80%</strong>')
    expect((html.match(/<strong/g) ?? []).length).toBe(1)
  })

  it('받을 수 없게 된 소식은 고정 문장이고 굵은 글자가 없다', () => {
    const html = render([BLOCKED])

    expect(visibleText(html)).toContain('캡슐이 가득 찼어요. 받지 못한 보상이 두 개라 지금은 잼을 받을 수 없어요')
    expect(html).not.toContain('<strong')
  })

  it('두 소식 모두 누르면 홈으로 간다', () => {
    expect(linkOf(render([NEARLY]))).toBe('/')
    expect(linkOf(render([BLOCKED]))).toBe('/')
  })

  it('아이콘은 선물이고 경고면이나 아바타가 아니라 일반 아이콘 타일이다', () => {
    for (const row of [NEARLY, BLOCKED]) {
      const html = render([row])

      expect(html).toContain(icon(GiftIcon))
      expect(html).toContain('w-10 h-10 rounded-2xl bg-background-secondary flex items-center justify-center')
      expect(html).not.toContain('bg-warning')
      expect(html).not.toContain(d.profile.avatarAlt)
    }
  })
})

describe('새 세 종류의 행이 함께 있을 때', () => {
  it('각 행이 자기 착지와 자기 아이콘을 가진다', () => {
    const html = render([
      view('suspension_started', { suspension_id: 's1' }, { id: 'n1' }),
      view('suspension_lifted', { suspension_id: 's1' }, { id: 'n2' }),
      view('reward_pending', { mission_id: 'm1', mission_title: '한강 100km' }, { id: 'n3' }),
    ])

    const links = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])
    expect(links).toEqual(['/', '/', '/missions/m1'])
    expect(html.split(icon(LockIcon)).length - 1).toBe(1)
    expect(html.split(icon(CheckCircleIcon)).length - 1).toBe(1)
    expect(html.split(icon(GiftIcon)).length - 1).toBe(1)
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
