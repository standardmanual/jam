/**
 * 탈퇴 시트·서버 응답·로그인 안내 문구 규칙 (티켓 20261021_1249 3회, UX 라이팅 가이드, 채원 사전 판정 2026-10-21)
 *
 * - 확인 문구와 보관 개월 수는 사전에 글자로 박지 않는다: `{phrase}`·`{confirmMonths}`·`{abuseMonths}`로 받아 상수 한 곳에서 끌어온다.
 * - 고정 용어(가이드 1.3절): Strava는 «동기화», 방문이 아니라 «체크인», POI가 아니라 «장소», 포인트 앞에 JAM을 붙이지 않는다.
 * - «확인»·«다음» 버튼, 엠대시, 말줄임표, 이모지, 느낌표를 쓰지 않는다(2.3절 «단호·명확», 7절).
 * - 마침표: 제목·버튼·라벨·인라인 불일치 한 문장은 없고(3절), 여러 문장 본문은 문장마다 있다.
 * - «탈퇴»는 행위(제목·버튼·확인 문구), «지워져요»는 데이터에만 쓴다. 지킬 수 없는 약속과 상투 표현을 쓰지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/i18n/__tests__/withdrawCopy.test.ts
 */
import { describe, it, expect } from 'vitest'
import { d, t } from '@/lib/i18n'
import { ABUSE_LOG_RETENTION_MONTHS, CONFIRMATION_RETENTION_MONTHS } from '@/lib/account/retention'
import { WITHDRAW_CONFIRM_PHRASE } from '@/lib/account/withdraw-contract'

const sheet = d.withdrawSheet
const account = d.account

/** 이 기능이 새로 쓰거나 바꾼 모든 사용자 노출 문구 */
const all: Record<string, string> = {
  ...Object.fromEntries(Object.entries(sheet).map(([k, v]) => [`withdrawSheet.${k}`, v])),
  ...Object.fromEntries(Object.entries(account).map(([k, v]) => [`account.${k}`, v])),
  'auth.withdrawnNotice': d.auth.withdrawnNotice,
  'profileEdit.withdrawButton': d.profileEdit.withdrawButton,
}

/** 제목·버튼·라벨·한 문장 — 마침표가 없다 */
const noPeriod = [
  sheet.title,
  sheet.removedLabel,
  sheet.rowActivityBadges,
  sheet.rowCheckinBadges,
  sheet.rowItemBadges,
  sheet.rowJam,
  sheet.rowPoints,
  sheet.keptLabel,
  sheet.confirmMismatch,
  sheet.cancel,
  sheet.confirm,
  sheet.confirming,
  d.profileEdit.withdrawButton,
]

/** 안내 본문 — 문장마다 마침표가 있고 마침표로 끝난다 */
const withPeriod = [
  sheet.intro,
  sheet.stravaSync,
  sheet.removedFallback,
  sheet.keptRecords,
  sheet.keptDrops,
  sheet.confirmLabel,
  account.deleteFailed,
  account.deleteAdminForbidden,
  account.deleteConfirmMismatch,
  d.auth.withdrawnNotice,
]

describe('탈퇴 문구 — 사실을 한 곳에서만 쓴다', () => {
  it('확인 문구 «탈퇴합니다»를 사전에 글자로 박지 않고 {phrase}로 받는다', () => {
    for (const text of [sheet.confirmLabel, sheet.confirmMismatch, account.deleteConfirmMismatch]) {
      expect(text, text).toContain('{phrase}')
      expect(text, text).not.toContain(WITHDRAW_CONFIRM_PHRASE)
    }
  })

  it('보관 개월 수를 글자로 박지 않고 상수에서 끼워 넣는다', () => {
    expect(sheet.keptRecords).toContain('{confirmMonths}개월')
    expect(sheet.keptRecords).toContain('{abuseMonths}개월')
    expect(sheet.keptRecords).not.toMatch(/\d+개월/)

    const filled = t(sheet.keptRecords, {
      confirmMonths: CONFIRMATION_RETENTION_MONTHS,
      abuseMonths: ABUSE_LOG_RETENTION_MONTHS,
    })
    expect(filled).toContain(`법에 따라 ${CONFIRMATION_RETENTION_MONTHS}개월`)
    expect(filled).toContain(`부정 이용 탐지 기록은 ${ABUSE_LOG_RETENTION_MONTHS}개월`)
    expect(filled).not.toMatch(/\{\w+\}/)
  })

  it('상수를 끼워 넣으면 확정된 문장이 된다', () => {
    expect(t(sheet.confirmLabel, { phrase: WITHDRAW_CONFIRM_PHRASE })).toBe('계속하려면 "탈퇴합니다"를 입력해 주세요.')
    expect(t(sheet.confirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE })).toBe('"탈퇴합니다"와 똑같이 입력해 주세요')
    expect(t(account.deleteConfirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE })).toBe(
      '확인 문구가 맞지 않아요. "탈퇴합니다"를 다시 입력해 주세요.'
    )
  })
})

describe('탈퇴 문구 — 확정안과 같다', () => {
  it('제목, 본문, 버튼이 사전의 확정 문구다', () => {
    expect(sheet.title).toBe('JAM!에서 탈퇴할까요?')
    expect(sheet.intro).toBe('탈퇴하면 계정이 바로 지워지고 되돌릴 수 없어요.')
    expect([sheet.cancel, sheet.confirm, sheet.confirming]).toEqual(['취소', '탈퇴하기', '탈퇴하는 중'])
    expect(sheet.stravaSync).toBe('Strava 동기화도 함께 끊겨요.')
    expect(d.auth.withdrawnNotice).toBe('탈퇴가 끝났어요. 계정을 지웠어요.')
    expect(d.profileEdit.withdrawButton).toBe('탈퇴하기')
  })

  it('행 라벨 다섯 개는 순서대로 액티비티 배지·체크인 배지·아이템 배지·잼·포인트다', () => {
    expect([sheet.rowActivityBadges, sheet.rowCheckinBadges, sheet.rowItemBadges, sheet.rowJam, sheet.rowPoints]).toEqual([
      '액티비티 배지',
      '체크인 배지',
      '아이템 배지',
      '잼',
      '포인트',
    ])
  })

  it('옛 메일 신청 안내 문구는 사전에서 사라졌다', () => {
    expect(d.profileEdit).not.toHaveProperty('withdrawLink')
    expect(d.profileEdit).not.toHaveProperty('withdrawCaption')
  })

  it('요약을 읽지 못했을 때 문장은 다섯 항목과 Strava 동기화를 모두 말한다', () => {
    for (const word of ['액티비티 배지', '체크인 배지', '아이템 배지', '잼', '포인트', 'Strava 동기화']) {
      expect(sheet.removedFallback, word).toContain(word)
    }
  })
})

describe('탈퇴 문구 — 마침표 규칙(가이드 3절)', () => {
  it.each(noPeriod.map((text) => [text]))('제목·버튼·라벨·한 문장 «%s»에는 마침표가 없다', (text) => {
    expect(text.endsWith('.')).toBe(false)
  })

  it.each(withPeriod.map((text) => [text]))('안내 본문 «%s»는 마침표로 끝난다', (text) => {
    expect(text.endsWith('.')).toBe(true)
  })
})

describe('탈퇴 문구 — 용어와 톤(가이드 1.3, 2.3, 7절)', () => {
  const entries = Object.entries(all)

  it('사전에 새로 들어간 문구가 비어 있지 않다', () => {
    expect(entries.length).toBeGreaterThan(15)
    for (const [key, text] of entries) expect(text.trim().length, key).toBeGreaterThan(0)
  })

  it('Strava를 말하는 문구에 «연동»·«연결»을 쓰지 않는다(고정 용어는 «Strava 동기화»). 네트워크 «연결이 불안정»은 Strava가 아니라 허용한다', () => {
    for (const [key, text] of entries) {
      if (text.includes('Strava')) expect(text, key).not.toMatch(/연동|연결/)
      expect(text, key).not.toMatch(/연동/)
    }
    expect(account.deleteFailed).toContain('연결이 불안정')
  })

  it('«방문», «POI», «JAM 포인트»를 쓰지 않는다', () => {
    for (const [key, text] of entries) {
      expect(text, key).not.toMatch(/방문/)
      expect(text, key).not.toMatch(/POI/)
      expect(text, key).not.toMatch(/JAM\s*포인트/)
    }
  })

  it('«확인»·«다음»을 버튼 라벨로 쓰지 않는다', () => {
    for (const label of [sheet.cancel, sheet.confirm, sheet.confirming, d.profileEdit.withdrawButton]) {
      expect(label).not.toBe('확인')
      expect(label).not.toBe('다음')
    }
  })

  it('엠대시, 말줄임표, 이모지, 느낌표를 쓰지 않는다', () => {
    for (const [key, text] of entries) {
      expect(text, key).not.toMatch(/—|–|…|\.\.\./)
      expect(text, key).not.toMatch(/\p{Extended_Pictographic}/u)
      // 서비스 이름 «JAM!»의 느낌표만 예외다
      expect(text.replaceAll('JAM!', ''), key).not.toContain('!')
    }
  })

  it('이별 인사, 붙잡기, 상투 표현과 지킬 수 없는 약속이 없다', () => {
    // 강도어(슬롭 사전 1절)는 `scripts/check-slop.mjs`가 새 문구에서 따로 거르므로 여기서는 이별·붙잡기 표현과 지킬 수 없는 약속만 본다
    const banned = ['아쉬워', '소중한', '떠나', '안녕', '그동안', '언제든', '앱 목록', '그대로예요']
    for (const [key, text] of entries) {
      for (const word of banned) expect(text, `${key}: ${word}`).not.toContain(word)
    }
  })

  it('«탈퇴»는 행위에만 쓰고 데이터에는 «지워»를 쓴다 — 데이터를 말하는 문장에 «탈퇴»가 끼지 않는다', () => {
    for (const text of [
      sheet.removedLabel,
      sheet.rowActivityBadges,
      sheet.rowCheckinBadges,
      sheet.rowItemBadges,
      sheet.rowJam,
      sheet.rowPoints,
      sheet.removedFallback,
      sheet.keptLabel,
      sheet.keptRecords,
      sheet.keptDrops,
    ]) {
      expect(text, text).not.toContain('탈퇴')
    }
    expect(sheet.keptRecords).toContain('지워요')
    expect(sheet.removedFallback).toContain('지워지고')
  })

  it('실패 문구는 DB·Auth 원문 용어를 싣지 않는다', () => {
    for (const text of [account.deleteFailed, account.deleteAdminForbidden, account.deleteConfirmMismatch]) {
      expect(text, text).not.toMatch(/error|exception|constraint|foreign key|supabase|postgres|auth\./i)
    }
  })

  it('실패 문구는 [현상, 원인, 해결책] 순서이고 계정이 그대로라고 단정하지 않는다', () => {
    const [symptom, cause, remedy] = account.deleteFailed.split(/(?<=\.)\s+/)
    expect(symptom).toBe('탈퇴하지 못했어요.')
    expect(cause).toContain('수 있어요')
    expect(remedy).toContain('다시 시도')
    expect(account.deleteFailed).not.toMatch(/그대로|남아 있/)
  })
})
