/**
 * 밸런스 경고 문장·화면 문구 (티켓 20260930_1459 조각 A, 채원 확정 설계)
 *
 * 숫자 뒤 조사(과/와, 을/를)와 확정 문구를 글자 그대로 지킨다. 규칙 판정은 `evaluate.test.ts`가 본다.
 */
import { describe, it, expect } from 'vitest'
import {
  balanceNoticeSubtitle,
  balanceNoticeTitle,
  balanceRowChipLabel,
  economyKeyLabel,
  economyKeysMessage,
  formatCount,
  numberHasBatchim,
  openCollectionsNowText,
  singleActionMessage,
  toolCheckText,
  unreadableMessage,
  type UnreadableCause,
} from '../messages'
import { BALANCE_RULE_KEYS } from '../rules'

describe('숫자 뒤 받침(과/와, 을/를)', () => {
  it('10의 배수와 영·일·삼·육·칠·팔로 끝나는 수는 받침이 있다', () => {
    for (const n of ['0', '10', '30', '40', '100', '1', '11', '21', '3', '13', '6', '7', '8', '18']) {
      expect(numberHasBatchim(n), n).toBe(true)
    }
  })

  it('이·사·오·구로 끝나는 수는 받침이 없다', () => {
    for (const n of ['2', '4', '5', '9', '12', '15', '24', '29']) expect(numberHasBatchim(n), n).toBe(false)
  })

  it('소수는 마지막 자리 숫자를 읽는다', () => {
    expect(numberHasBatchim('2.5')).toBe(false) // 이 점 오
    expect(numberHasBatchim('2.3')).toBe(true) // 이 점 삼
  })

  it('formatCount: 정수는 그대로, 소수는 둘째 자리까지', () => {
    expect(formatCount(6)).toBe('6')
    expect(formatCount(2.5)).toBe('2.5')
    expect(formatCount(2.456)).toBe('2.46')
  })
})

describe('규칙 경고 문장', () => {
  it('R6: 채원 확정 문구와 글자가 같다', () => {
    expect(singleActionMessage('mission', 40, 30, 70, 50)).toBe(
      '미션 포인트 40과 보상 배지 포인트 30을 합쳐 70 포인트를 한 번에 받아요. 미션은 50 포인트까지가 기준이에요.'
    )
  })

  it('R6: 받침이 없는 수는 와·를이 붙는다', () => {
    expect(singleActionMessage('collection_completion', 12, 15, 27, 20)).toBe(
      '컬렉션 완성 포인트 12와 보상 배지 포인트 15를 합쳐 27 포인트를 한 번에 받아요. 컬렉션 완성은 20 포인트까지가 기준이에요.'
    )
  })

  it('R8 이름표: 드랍 확률·등급 비율은 「드랍 확률 값」, 믹스 실패 보상, 나머지는 「경제 정책 값」', () => {
    expect(economyKeyLabel('rarity_common')).toBe('드랍 확률 값')
    expect(economyKeyLabel('rarity_mystic')).toBe('드랍 확률 값')
    expect(economyKeyLabel('bonus_drop_rate_intense')).toBe('드랍 확률 값')
    expect(economyKeyLabel('fail_reward_points')).toBe('믹스 실패 보상 값')
    expect(economyKeyLabel('completion_decay')).toBe('경제 정책 값')
  })

  it('R8: 키 3개까지는 이름을 다 보이고 그 이상은 「외 N개」다', () => {
    expect(economyKeysMessage(['rarity_common', 'rarity_rare', 'completion_decay'])).toBe(
      '경제 정책 값 3개(rarity_common, rarity_rare, completion_decay)가 이 항목에 들어 있어요. 경제 수치는 기획에서 바꾸지 않는 게 기준이에요.'
    )
  })
})

describe('점검 못 함 문장', () => {
  const CAUSES: UnreadableCause[] = [
    'start_missing',
    'start_invalid',
    'end_missing',
    'end_invalid',
    'points_missing',
    'points_invalid',
    'condition',
    'reward_badge',
    'state',
    'rule_value',
  ]

  it('모든 규칙·까닭 조합이 「확인하지 못했어요」로 끝나는 두 문장이고 규칙 이름이 들어 있다', () => {
    for (const rule of BALANCE_RULE_KEYS) {
      for (const cause of CAUSES) {
        const message = unreadableMessage(rule, cause)
        expect(message, `${rule}/${cause}`).toMatch(/확인하지 못했어요\. .+다시 확인해요\.$/)
      }
    }
  })

  it('규칙 이름의 조사가 맞다(을/를)', () => {
    expect(unreadableMessage('open_collections_max', 'state')).toContain('동시 개방 컬렉션 수를')
    expect(unreadableMessage('launch_lead_days_min', 'state')).toContain('개방 리드타임을')
    expect(unreadableMessage('single_action_points', 'state')).toContain('포인트 합을')
    expect(unreadableMessage('economy_keys', 'state')).toContain('경제 수치 불변을')
  })
})

describe('화면 문구', () => {
  it('묶음 알림 제목·부제, 행 칩', () => {
    expect(balanceNoticeTitle(3)).toBe('밸런스 경고 3건이 있어요')
    expect(balanceNoticeSubtitle(2, 1)).toBe('주의 2건 · 참고 1건. 경고가 있어도 승인할 수 있어요.')
    expect(balanceRowChipLabel('warn', 2)).toBe('밸런스 주의 2')
    expect(balanceRowChipLabel('info', 1)).toBe('밸런스 참고 1')
  })

  it('컬렉션 런칭 보조 줄', () => {
    expect(openCollectionsNowText(30)).toBe('지금 열린 컬렉션은 30개예요')
  })

  describe('툴 점검 줄', () => {
    const base = { status: 'reviewing', evaluationFailed: false, checkedRuleCount: 7, warnCount: 0, infoCount: 0 }

    it('경고 없음 / 경고 있음 / 적용 규칙 없음 / 평가 실패', () => {
      expect(toolCheckText(base)).toBe('켜 둔 규칙 7개를 확인했고 넘는 것이 없어요')
      expect(toolCheckText({ ...base, warnCount: 2, infoCount: 1 })).toBe('켜 둔 규칙 7개를 확인했고 주의 2건, 참고 1건이 있어요')
      expect(toolCheckText({ ...base, checkedRuleCount: 0 })).toBe('이 항목에 적용되는 켜 둔 규칙이 없어요')
      expect(toolCheckText({ ...base, evaluationFailed: true })).toBe('확인하지 못했어요')
    })

    it('참고(점검 못 함)만 있어도 「넘는 것이 없어요」가 아니다', () => {
      expect(toolCheckText({ ...base, infoCount: 1 })).toBe('켜 둔 규칙 7개를 확인했고 주의 0건, 참고 1건이 있어요')
    })

    it('반려·취소·실패 항목은 상태에 맞춰 확인하지 않는다고 말한다(평가 실패보다 우선)', () => {
      expect(toolCheckText({ ...base, status: 'rejected', checkedRuleCount: 0 })).toBe('반려한 항목은 밸런스를 확인하지 않아요')
      expect(toolCheckText({ ...base, status: 'cancelled', checkedRuleCount: 0 })).toBe('취소한 항목은 밸런스를 확인하지 않아요')
      expect(toolCheckText({ ...base, status: 'failed', checkedRuleCount: 0, evaluationFailed: true })).toBe(
        '실패한 항목은 밸런스를 확인하지 않아요'
      )
    })
  })
})
