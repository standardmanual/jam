/**
 * 유저용 탈퇴 계약 — 확인 문구 일치 검사와 요약 파서 (티켓 20261021_1249 3회)
 *
 * 고정하는 것: 앞뒤 공백을 무시하고 NFC로 정규화한 뒤 «탈퇴합니다»와 같을 때만 일치 · 부분 일치·다른 문구·문자열이 아닌 값은 불일치 ·
 * 요약 파서는 계약 밖 모양을 null로 돌려준다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/withdraw-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { WITHDRAW_CONFIRM_PHRASE, isWithdrawConfirmed, normalizeConfirmInput, parseAccountSummary } from '../withdraw-contract'

describe('WITHDRAW_CONFIRM_PHRASE', () => {
  it('«탈퇴합니다»다 — 화면과 서버가 이 한 곳의 글자를 쓴다', () => {
    expect(WITHDRAW_CONFIRM_PHRASE).toBe('탈퇴합니다')
  })
})

describe('isWithdrawConfirmed — 확인 문구 일치', () => {
  it('정확히 같으면 일치한다', () => {
    expect(isWithdrawConfirmed('탈퇴합니다')).toBe(true)
  })

  it('앞뒤 공백은 무시한다 — 공백, 탭, 줄바꿈, 전각 공백, 앞뒤 NBSP', () => {
    expect(isWithdrawConfirmed('  탈퇴합니다  ')).toBe(true)
    expect(isWithdrawConfirmed('\t탈퇴합니다\n')).toBe(true)
    expect(isWithdrawConfirmed('　탈퇴합니다　')).toBe(true)
    expect(isWithdrawConfirmed(' 탈퇴합니다 ')).toBe(true)
  })

  it('붙여넣은 글자가 NFD(자모 분리)여도 NFC로 정규화해 일치한다', () => {
    const decomposed = '탈퇴합니다'.normalize('NFD')
    expect(decomposed).not.toBe('탈퇴합니다')
    expect(isWithdrawConfirmed(decomposed)).toBe(true)
    expect(normalizeConfirmInput(`  ${decomposed} `)).toBe('탈퇴합니다')
  })

  it.each([
    ['빈 문자열', ''],
    ['공백만', '   '],
    ['일부만 입력', '탈퇴합니'],
    ['한 글자 더', '탈퇴합니다!'],
    ['중간 공백', '탈퇴 합니다'],
    ['어드민 문구', '삭제합니다'],
    ['문구 앞뒤에 다른 글자', '네 탈퇴합니다'],
  ])('%s는 불일치다', (_label, input) => {
    expect(isWithdrawConfirmed(input)).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['숫자', 1],
    ['객체', { confirmPhrase: '탈퇴합니다' }],
    ['배열', ['탈퇴합니다']],
  ])('문자열이 아닌 값(%s)은 불일치다', (_label, input) => {
    expect(isWithdrawConfirmed(input)).toBe(false)
  })
})

describe('parseAccountSummary', () => {
  const valid = {
    summary: {
      activityBadgeCount: 12,
      checkinBadgeCount: 7,
      itemCount: 20,
      jamBalance: 340,
      pointBalance: 1200,
      stravaConnected: true,
    },
  }

  it('계약에 맞는 응답을 읽는다 — 0도 그대로 읽는다', () => {
    expect(parseAccountSummary(valid)).toEqual(valid.summary)
    const zeros = {
      summary: { ...valid.summary, activityBadgeCount: 0, checkinBadgeCount: 0, itemCount: 0, jamBalance: 0, pointBalance: 0, stravaConnected: false },
    }
    expect(parseAccountSummary(zeros)).toEqual(zeros.summary)
  })

  it('계약에 없는 칸은 버린다', () => {
    const parsed = parseAccountSummary({ summary: { ...valid.summary, email: 'a@x.com' } })
    expect(parsed).toEqual(valid.summary)
    expect(parsed).not.toHaveProperty('email')
  })

  it.each([
    ['null', null],
    ['문자열', 'ok'],
    ['summary 없음', {}],
    ['summary가 null', { summary: null }],
    ['칸 하나 빠짐', { summary: { ...valid.summary, itemCount: undefined } }],
    ['음수 개수', { summary: { ...valid.summary, activityBadgeCount: -1 } }],
    ['소수 개수', { summary: { ...valid.summary, checkinBadgeCount: 1.5 } }],
    ['문자열 개수', { summary: { ...valid.summary, itemCount: '20' } }],
    ['소수 잔액', { summary: { ...valid.summary, jamBalance: 0.5 } }],
    ['불리언이 아닌 Strava 상태', { summary: { ...valid.summary, stravaConnected: 'yes' } }],
  ])('계약 밖 모양(%s)은 null이다', (_label, data) => {
    expect(parseAccountSummary(data)).toBeNull()
  })

  it('음수 잔액은 요약 전체를 버리지 않고 그대로 읽는다', () => {
    expect(parseAccountSummary({ summary: { ...valid.summary, pointBalance: -30 } })?.pointBalance).toBe(-30)
  })
})
