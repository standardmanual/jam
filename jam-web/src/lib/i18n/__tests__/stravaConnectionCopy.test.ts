/**
 * Strava 끊김·끊기·중복 안내 문구 규칙 (티켓 20261017_1422 2회, UX 라이팅 가이드)
 *
 * - 고정 용어: Strava에 대해 «연동»·«연결»을 쓰지 않는다(§1.3 «Strava 동기화»). 예외: 두 JAM! 계정이 한 Strava 계정에 이어지는 중복 안내 시트와
 *   그 시트의 서버 응답 문구(`duplicateSheet`, `replaceResult`)는 «연결»을 쓴다(티켓 20261021_1249 4회, §1.3 예외 한 줄). «연동»은 어디서도 쓰지 않는다.
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
]

/** 중복 안내 시트와 그 서버 응답 문구 — «연결» 예외 구역(위 설명). 문장은 마침표로 끝난다 */
const duplicateSentences: string[] = [
  ...c.duplicateSheet.offerBody,
  ...c.duplicateSheet.blockedBody,
  ...Object.values(c.replaceResult),
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
]

/** 중복 안내 시트의 제목·버튼 — 마침표가 없다 */
const duplicateLabels: string[] = [
  c.duplicateSheet.title,
  c.duplicateSheet.cancel,
  c.duplicateSheet.close,
  c.duplicateSheet.confirm,
  c.duplicateSheet.confirming,
]

/** 가이드 §4 예시가 정한 원인 문장 — 이 구절 안의 «해제»만 허용한다 */
const ALLOWED_RELEASE_PHRASE = '동기화 권한이 해제됐'

describe('Strava 끊김·끊기·중복 안내 문구', () => {
  const all = [...sentences, ...labels]
  const allWithDuplicate = [...all, ...duplicateSentences, ...duplicateLabels]

  it('끊김·끊기 문구는 «연동»과 «연결»을 쓰지 않는다 (Strava 고정 용어는 «Strava 동기화»)', () => {
    for (const text of all) {
      expect(text, text).not.toMatch(/연동|연결/)
    }
  })

  it('«연동»은 중복 안내 시트 문구에서도 쓰지 않는다 — «연결»만 예외다', () => {
    for (const text of [...duplicateSentences, ...duplicateLabels]) {
      expect(text, text).not.toMatch(/연동/)
    }
  })

  it('«해제»는 가이드 §4 원인 문장 말고는 쓰지 않는다', () => {
    for (const text of allWithDuplicate) {
      expect(text.split(ALLOWED_RELEASE_PHRASE).join(''), text).not.toContain('해제')
    }
  })

  it('문장은 해요체 마침표로 끝나고, 제목·버튼·라벨에는 마침표가 없다', () => {
    for (const text of [...sentences, ...duplicateSentences]) expect(text, text).toMatch(/[요다]\.$/)
    for (const text of [...labels, ...duplicateLabels]) expect(text, text).not.toMatch(/\.$/)
  })

  it('동작 이름은 «끊기»와 «끊겼어요»를 짝으로 쓴다', () => {
    expect(c.settings.disconnectButton).toBe('동기화 끊기')
    expect(c.card.title).toContain('끊겼어요')
    expect(c.settings.disconnectedByUser).toContain('끊었어요')
    expect(c.settings.disconnectedByUser).not.toContain('끊겼어요')
  })

  it('중복 안내 시트 offer는 현상, 결과, 시작 순의 3문장이다 (티켓 20261021_1249 4회)', () => {
    expect(c.duplicateSheet.offerBody).toEqual([
      '이 Strava 계정은 이미 다른 JAM! 계정에 연결돼 있어요.',
      '그래도 연결하면 그 계정은 삭제되고 복구할 수 없어요. 그 계정의 배지, 잼, 포인트는 이 계정으로 옮겨지지 않아요.',
      '연결한 뒤 첫 동기화는 가장 최근 활동 1건부터 시작해요. 지금 계정의 기록은 그대로예요.',
    ])
  })

  it('중복 안내 시트 offer의 첫 줄은 «연결돼 있어요»다 — 끊긴 연결 행도 중복으로 잡히므로 «동기화돼 있어요»가 아니다', () => {
    expect(c.duplicateSheet.offerBody[0]).toContain('연결돼 있어요')
    expect(c.duplicateSheet.offerBody[0]).not.toContain('동기화돼')
    expect(c.duplicateSheet.blockedBody[0]).toBe(c.duplicateSheet.offerBody[0])
  })

  it('중복 안내 시트 offer의 3번째 문장은 지금 계정이 초기화되는 뜻으로 읽히지 않는다', () => {
    const third = c.duplicateSheet.offerBody[2]
    expect(third).toContain('지금 계정의 기록은 그대로예요')
    expect(third).not.toMatch(/처음부터|초기화|다시 쌓/)
  })

  it('중복 안내 시트 blocked는 문의로 안내하고 막힌 까닭을 쓰지 않는다', () => {
    expect(c.duplicateSheet.blockedBody).toEqual([
      '이 Strava 계정은 이미 다른 JAM! 계정에 연결돼 있어요.',
      '지금은 이 계정으로 연결할 수 없어요. 확인이 필요하면 문의해 주세요.',
    ])
    expect(c.duplicateSheet.close).toBe('닫기')
    expect(c.replaceResult.blocked).not.toMatch(/어드민|관리자|정지/)
  })

  it('중복 안내 시트와 응답 문구에 «준비 중»처럼 향후를 약속하는 표현·붙잡기·압박·엠대시·«확인»·«계속» 버튼이 없다', () => {
    for (const text of [...duplicateSentences, ...duplicateLabels]) {
      expect(text, text).not.toMatch(/준비 중|나중에|곧|예정|정말|지금 바로|—/)
    }
    expect(c.duplicateSheet.confirm).toBe('그래도 연결하기')
    expect(c.duplicateSheet.confirming).toBe('연결하는 중')
    for (const label of [c.duplicateSheet.cancel, c.duplicateSheet.close, c.duplicateSheet.confirm]) {
      expect(label).not.toMatch(/^(확인|계속)$/)
    }
  })

  it('«Strava 앱 목록에서 빠진다» 약속은 중복 안내 시트에 쓰지 않는다 — 이 경로는 앱 해제를 건너뛴다', () => {
    for (const text of [...duplicateSentences, ...duplicateLabels]) {
      expect(text, text).not.toMatch(/앱 목록|해제/)
    }
  })

  it('실패 문구 네 가지는 현상 뒤에 해결을 말한다 (오류 원문 없음)', () => {
    expect(c.replaceResult.retry).toBe('연결하지 못했어요. 일시적인 문제일 수 있어요. 잠시 후 다시 눌러 주세요.')
    expect(c.replaceResult.restart).toBe('시간이 지나 연결 요청이 닫혔어요. Strava 동기화를 처음부터 다시 진행해 주세요.')
    expect(c.replaceResult.afterDeleteFailed).toBe('기존 계정은 삭제됐지만 이 계정에 연결하지 못했어요. Strava 동기화를 다시 진행해 주세요.')
    expect(c.replaceResult.blocked).toBe('지금은 이 Strava 계정으로 연결할 수 없어요. 확인이 필요하면 문의해 주세요.')
    for (const text of Object.values(c.replaceResult)) expect(text, text).not.toMatch(/오류|error|exception|토큰|token/i)
  })

  it('끊기 실패 토스트는 현상과 해결을 한 문장씩 말한다', () => {
    const [phenomenon, remedy] = c.disconnectSheet.errorToast.split('. ')
    expect(phenomenon).toBe('동기화를 끊지 못했어요')
    expect(remedy).toBe('잠시 후 다시 시도해 주세요.')
  })
})
