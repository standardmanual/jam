/**
 * Strava 끊김·끊기·중복 안내 문구 규칙 (티켓 20261017_1422 2회, UX 라이팅 가이드)
 *
 * - 고정 용어: Strava에 대해 «연동»·«연결»을 쓰지 않는다(§1.3 «Strava 동기화»).
 * - «해제»는 장착 해제(UNEQUIP)의 고정 용어라 쓰지 않는다. 단 가이드 §4(Error 401 예시)가 문구로 정한
 *   «동기화 권한이 해제됐을 수 있어요»는 허용한다 — 이 원인 문장은 채원이 사용자 승인으로 확정한 것이다.
 * - 해요체 문장은 마침표로 끝난다. 제목·버튼·라벨에는 마침표를 붙이지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/i18n/__tests__/stravaConnectionCopy.test.ts
 */
import { describe, it, expect } from 'vitest'
import { d } from '@/lib/i18n'

const c = d.stravaConnection

/** 두 문장 이상이거나 안내문 단락인 문구 — 마침표로 끝난다(가이드 마침표 표: 본문 / 안내문) */
const sentences: string[] = [
  c.card.body,
  c.settings.disconnectedError,
  c.settings.disconnectedByUser,
  ...c.disconnectSheet.body,
  c.disconnectSheet.errorToast,
  ...c.duplicateSheet.body,
]

/** 제목·버튼·라벨·한 문장 상태 문구·토스트 — 마침표가 없다(가이드 마침표 표: 제목 / 버튼 / 한 문장 본문) */
const labels: string[] = [
  c.chipLabel,
  c.card.title,
  c.card.cta,
  c.topNavReconnect,
  c.settings.label,
  c.settings.connected,
  c.settings.disconnectButton,
  c.settings.reconnectButton,
  c.disconnectSheet.title,
  c.disconnectSheet.cancel,
  c.disconnectSheet.confirm,
  c.disconnectSheet.confirming,
  c.disconnectSheet.successToast,
  c.duplicateSheet.title,
  c.duplicateSheet.cancel,
]

/** 가이드 §4 예시가 정한 원인 문장 — 이 구절 안의 «해제»만 허용한다 */
const ALLOWED_RELEASE_PHRASE = '동기화 권한이 해제됐'

describe('Strava 끊김·끊기·중복 안내 문구', () => {
  const all = [...sentences, ...labels]

  it('«연동»과 «연결»을 쓰지 않는다 (Strava 고정 용어는 «Strava 동기화»)', () => {
    for (const text of all) {
      expect(text, text).not.toMatch(/연동|연결/)
    }
  })

  it('«해제»는 가이드 §4 원인 문장 말고는 쓰지 않는다', () => {
    for (const text of all) {
      expect(text.split(ALLOWED_RELEASE_PHRASE).join(''), text).not.toContain('해제')
    }
  })

  it('문장은 해요체 마침표로 끝나고, 제목·버튼·라벨에는 마침표가 없다', () => {
    for (const text of sentences) expect(text, text).toMatch(/[요다]\.$/)
    for (const text of labels) expect(text, text).not.toMatch(/\.$/)
  })

  it('동작 이름은 «끊기»와 «끊겼어요»를 짝으로 쓴다', () => {
    expect(c.settings.disconnectButton).toBe('동기화 끊기')
    expect(c.card.title).toContain('끊겼어요')
    expect(c.settings.disconnectedByUser).toContain('끊었어요')
    expect(c.settings.disconnectedByUser).not.toContain('끊겼어요')
  })

  it('중복 안내 시트는 채원이 확정한 4문장 그대로다', () => {
    expect(c.duplicateSheet.body).toEqual([
      '이 Strava 계정은 이미 다른 JAM! 계정에 동기화돼 있어요.',
      '이 계정으로 새로 시작하면 기존 JAM! 계정은 삭제되고 복구할 수 없어요.',
      '새로 시작한 계정은 활동 기록과 배지를 처음부터 다시 쌓아요.',
      '지금은 새로 시작할 수 없어서 동기화를 저장하지 않았고, 지금 계정은 그대로예요.',
    ])
  })

  it('중복 안내 시트에 «준비 중»처럼 향후를 약속하는 표현이 없다', () => {
    for (const text of [...c.duplicateSheet.body, c.duplicateSheet.title]) {
      expect(text, text).not.toMatch(/준비 중|나중에|곧|예정/)
    }
  })

  it('끊기 실패 토스트는 현상과 해결을 한 문장씩 말한다', () => {
    const [phenomenon, remedy] = c.disconnectSheet.errorToast.split('. ')
    expect(phenomenon).toBe('동기화를 끊지 못했어요')
    expect(remedy).toBe('잠시 후 다시 시도해 주세요.')
  })
})
