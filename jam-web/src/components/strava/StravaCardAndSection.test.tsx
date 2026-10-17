/**
 * Strava 끊김 카드(홈)와 설정 구획(프로필) 상태별 렌더 (티켓 20261017_1422 2회, 채원 사전 판정 2026-10-17)
 *
 * - 홈 카드: 라벨·제목·본문·CTA를 d.* 문구로 그리고, 면을 빨강·노랑으로 칠하지 않으며 Strava 주황을 쓰지 않는다
 * - 홈 노출 판정: 오류로 끊긴 상태에서만 카드가 있다. 정상·미연동·유저가 직접 끊음·조회 실패는 카드가 없다
 * - 설정 구획: connected / 끊김(오류) / 끊김(유저가 직접 끊음) 세 상태의 문구와 버튼. none은 구획 자체가 없다
 *
 * 저장소에 jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/strava/StravaCardAndSection.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import StravaDisconnectedCard from './StravaDisconnectedCard'
import StravaSettingsSection from './StravaSettingsSection'
import { d } from '@/lib/i18n'
import {
  resolveStravaUiState,
  showsStravaDisconnectedCard,
  showsStravaSyncCta,
  type StravaHomeView,
} from '@/lib/strava/connection-state'

const AT = '2026-10-17T00:00:00.000Z'
const noop = () => {}

describe('StravaDisconnectedCard — 홈 끊김 카드', () => {
  const html = renderToStaticMarkup(<StravaDisconnectedCard />)
  const copy = d.stravaConnection

  it('라벨·제목·본문·CTA를 d.* 문구 그대로 그린다 (현상, 원인, 해결책 세 줄)', () => {
    expect(html).toContain(copy.chipLabel)
    expect(html).toContain(copy.card.title)
    expect(html).toContain(copy.card.body)
    expect(html).toContain(copy.card.cta)
  })

  it('흰 Card(--surface + 1px --border) 위에 LabelChip과 검정 알약 버튼(primary main, 전체 폭)이다', () => {
    expect(html).toContain('background:var(--surface)')
    expect(html).toContain('border:1px solid var(--border)')
    expect(html).toMatch(/<span class="self-start"[^>]*>Strava 동기화<\/span>/)
    const button = /<button[^>]*>(?:(?!<\/button>).)*<\/button>/.exec(html)?.[0] ?? ''
    expect(button).toContain('bg-background-inverse')
    expect(button).toContain('text-snow')
    expect(button).toContain('w-full')
  })

  it('본문은 왼쪽 정렬이고 한국어 줄바꿈 클래스를 갖는다', () => {
    expect(html).toContain('text-left')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
  })

  it('면을 경고색으로 칠하지 않고 Strava 주황·이모지·그림자·애니메이션을 쓰지 않는다', () => {
    expect(html).not.toMatch(/#FC4C02/i)
    expect(html).not.toContain('--warning')
    expect(html).not.toContain('--danger')
    expect(html).not.toMatch(/animate-|shadow/)
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}⚠]/u)
  })
})

describe('홈 끊김 카드 노출 판정', () => {
  const view = (row: { disconnected_at: string | null; disconnect_reason: string | null } | null): StravaHomeView =>
    resolveStravaUiState(row)

  it('오류로 끊긴 상태(토큰 갱신 실패·Strava 철회)에서만 카드를 그린다', () => {
    expect(showsStravaDisconnectedCard(view({ disconnected_at: AT, disconnect_reason: 'token_refresh_failed' }))).toBe(true)
    expect(showsStravaDisconnectedCard(view({ disconnected_at: AT, disconnect_reason: 'token_revoked' }))).toBe(true)
  })

  it('정상 연결은 카드가 DOM에 없다', () => {
    expect(showsStravaDisconnectedCard(view({ disconnected_at: null, disconnect_reason: null }))).toBe(false)
  })

  it('미연동과 유저가 직접 끊은 경우는 카드가 없다 — 대신 «Strava 동기화하면 시작해요» CTA가 보인다', () => {
    const none = view(null)
    const byUser = view({ disconnected_at: AT, disconnect_reason: 'user_disconnected' })
    for (const v of [none, byUser]) {
      expect(showsStravaDisconnectedCard(v)).toBe(false)
      expect(showsStravaSyncCta(v)).toBe(true)
    }
  })

  it('조회 실패(unknown)는 알람 카드도 CTA도 그리지 않는다', () => {
    expect(showsStravaDisconnectedCard('unknown')).toBe(false)
    expect(showsStravaSyncCta('unknown')).toBe(false)
  })

  it('끊김 상태에서는 진행도 셀에 CTA(«Strava 동기화하면 시작해요»)가 중복으로 나오지 않는다', () => {
    expect(showsStravaSyncCta(view({ disconnected_at: AT, disconnect_reason: 'token_refresh_failed' }))).toBe(false)
    expect(showsStravaSyncCta(view({ disconnected_at: null, disconnect_reason: null }))).toBe(false)
  })
})

describe('StravaSettingsSection — 프로필 설정 구획 세 상태', () => {
  const copy = d.stravaConnection.settings
  const render = (state: 'connected' | 'disconnected_error' | 'disconnected_user', lastSyncedAt: string | null = null) =>
    renderToStaticMarkup(<StravaSettingsSection state={state} lastSyncedAt={lastSyncedAt} onDisconnect={noop} />)

  it('connected: 「동기화하고 있어요」와 outline 전체 폭 「동기화 끊기」 버튼', () => {
    const html = render('connected')
    expect(html).toContain(copy.label)
    expect(html).toContain(copy.connected)
    expect(html).toContain(copy.disconnectButton)
    expect(html).not.toContain(copy.reconnectButton)
    const button = /<button[^>]*>동기화 끊기<\/button>/.exec(html)?.[0] ?? ''
    expect(button).toContain('border-field-border')
    expect(button).toContain('bg-transparent')
    expect(button).toContain('w-full')
  })

  it('connected이고 마지막 동기화 시각이 있으면 보조 줄에 «마지막 동기화»를 보인다', () => {
    expect(render('connected', AT)).toContain(d.auth.stravaLastSyncedLabel)
    expect(render('connected', null)).not.toContain(d.auth.stravaLastSyncedLabel)
  })

  it('끊김(오류): 현상과 원인을 알리고 「Strava 다시 동기화하기」 버튼이다', () => {
    const html = render('disconnected_error', AT)
    expect(html).toContain(copy.disconnectedError)
    expect(html).toContain(copy.reconnectButton)
    expect(html).not.toContain(copy.disconnectButton)
    // 끊김 상태에서는 마지막 동기화 보조 줄을 그리지 않는다
    expect(html).not.toContain(d.auth.stravaLastSyncedLabel)
  })

  it('끊김(유저가 직접 끊음): «끊었어요» 어조이고 기록이 남아 있음을 알린다', () => {
    const html = render('disconnected_user', AT)
    expect(html).toContain(copy.disconnectedByUser)
    expect(html).toContain(copy.reconnectButton)
    // 오류 어조(«끊겼어요»)를 쓰지 않는다
    expect(html).not.toContain('끊겼어요')
  })

  it('카드 틀이나 구분선을 만들지 않는다 — 기존 «라벨, 값» 구획과 같은 문법(text-base text-muted 라벨)', () => {
    const html = render('connected')
    expect(html).toContain('text-base text-muted')
    expect(html).not.toContain('border-t')
    expect(html).not.toContain('background:var(--surface)')
  })
})
