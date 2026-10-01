/**
 * 운영 설정(S7) 화면 부품의 초기 렌더 (티켓 20260930_1459 조각 B, 채원 확정 설계 「조각 B (S7 운영 설정)」)
 *
 * 저장소에 jsdom·testing-library가 없어(`balance.test.tsx`와 같은 방식) 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다. 값을 고치는 동안
 * 바뀌는 결과 문장·저장 전 표시·오류 문장·저장 본문의 판정은 순수 함수라 `lib/admin/opsInbox/balance/__tests__/settings.test.ts`가 본다.
 * 지키는 것:
 * - 규칙 8개가 세 그룹으로 보이고(카드 앵커 `#rule-<규칙 키>`), R5는 종류별 5칸, R6·R7은 R5 값을 읽기 전용으로, R8은 키 칩 목록으로 보인다
 * - 결과 문장(채원 확정 문구), R1 「지금 서비스」 상자, 못 읽을 때 문구, 「임시값·실측 전」 칩은 임시값 규칙에만
 * - 저장된 값이 입력에 들어 있고 [저장하기]는 바꾼 것이 없으면 비활성이며 「저장 전」 칩이 없다
 * - 한 번도 안 바꿨으면 「처음 값 그대로예요」, 바꿨으면 「마지막으로 바꾼 사람」·「직전 값」과 [직전 값으로 되돌리기]
 * - 꺼짐 안내(R5·R8은 전용 문구), 구역 조회 실패·규칙 없음 카드, 구역 이동 링크는 구역이 2개 이상일 때만
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/components/admin/ui/tooltip'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-settings',
  useSearchParams: () => new URLSearchParams(),
}))

import { OpsBalanceSettings } from '../OpsBalanceSettings'
import { OpsSettingsNav } from '../OpsSettingsNav'
import { OpsSettingsSection } from '../OpsSettingsSection'
import { SEED_ROWS } from '@/lib/admin/opsInbox/balance/__tests__/fixtures'
import { BALANCE_RULE_NAMES, toRuleRecord, type OpsRuleRecord } from '@/lib/admin/opsInbox/balance/rules'

const T0 = '2026-10-01T06:20:00+00:00' // 10/1(목) 15:20 KST

function seedRecords(patch: Record<string, Partial<OpsRuleRecord>> = {}): OpsRuleRecord[] {
  return SEED_ROWS.map((row) => {
    const record = toRuleRecord({ ...row, level: row.level, updated_at: T0, updated_by: null, previous_value: null, value: row.value as never })
    return { ...record, ...(patch[row.rule_key] ?? {}) }
  })
}

const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => html(node).replace(/<!-- -->/g, '')

/** 카드 하나의 마크업만 잘라 낸다(앵커 ID `rule-<키>`부터 다음 카드 앵커 전까지). */
function cardOf(markup: string, key: string): string {
  const marker = `id="rule-${key}"><form`
  const start = markup.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  const next = markup.slice(start + marker.length).search(/id="rule-[a-z_]+"><form/)
  return markup.slice(start, next === -1 ? undefined : start + marker.length + next)
}

describe('OpsBalanceSettings — 규칙 8개와 그룹', () => {
  const out = flat(<OpsBalanceSettings rules={seedRecords()} openCollectionsNow={30} />)

  it('세 그룹 제목이 순서대로 보인다', () => {
    const titles = [...out.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1])
    expect(titles).toEqual(['컬렉션 개방', '포인트 크기', '경제 수치 불변'])
  })

  it('카드 8장이 규칙 순서대로 있고 앵커가 #rule-<규칙 키>다', () => {
    const ids = [...out.matchAll(/id="(rule-[a-z_]+)"><form/g)].map((m) => m[1])
    expect(ids).toEqual([
      'rule-open_collections_max',
      'rule-weekly_new_collections_max',
      'rule-rolling_new_collections_max',
      'rule-launch_lead_days_min',
      'rule-point_reward_max',
      'rule-single_action_points',
      'rule-count_ladder_points',
      'rule-economy_keys',
    ])
    const names = [...out.matchAll(/<h4[^>]*>([^<]*)<\/h4>/g)].map((m) => m[1])
    expect(names).toEqual(Object.values(BALANCE_RULE_NAMES))
  })

  it('카드마다 작은 폼이다(Enter로 저장). 카드 안 입력은 이름표와 이어져 있다', () => {
    expect(out.match(/<form /g)).toHaveLength(8)
    expect(out).toContain('<label id="rule-open_collections_max-max-label" for="rule-open_collections_max-max"')
    expect(out).toContain('id="rule-open_collections_max-max"')
  })

  it('R1~R4 값 칸은 저장된 값과 단위를 보인다', () => {
    expect(cardOf(out, 'open_collections_max')).toContain('열어 둘 수 있는 컬렉션 최대 수')
    expect(cardOf(out, 'open_collections_max')).toMatch(/id="rule-open_collections_max-max"[^>]*value="6"/)
    expect(cardOf(out, 'weekly_new_collections_max')).toMatch(/value="1"/)
    expect(cardOf(out, 'rolling_new_collections_max')).toMatch(/value="2"/)
    expect(cardOf(out, 'launch_lead_days_min')).toMatch(/id="rule-launch_lead_days_min-min_days"[^>]*value="28"/)
    expect(cardOf(out, 'launch_lead_days_min')).toContain('>일<')
  })

  it('R5는 종류 5줄이고 줄마다 값·단위·결과 문장이 있다', () => {
    const card = cardOf(out, 'point_reward_max')
    for (const label of ['횟수형 JAM! 배지', '달성형 JAM! 배지', '미션', '컬렉션 완성', '레시피']) expect(card).toContain(`>${label}</label>`)
    expect(card.match(/inputMode="numeric"/g)).toHaveLength(5)
    expect(card).toContain('10 포인트를 넘으면 알려요')
    expect(card).toContain('100 포인트를 넘으면 알려요')
    expect(card).toContain('50 포인트를 넘으면 알려요')
    expect(card).toContain('20 포인트를 넘으면 알려요')
    expect(card).toContain('30 포인트를 넘으면 알려요')
  })

  it('R6·R7은 R5 값을 읽기 전용으로 보이고 R5 카드로 가는 앵커가 있다(입력 칸은 없다)', () => {
    const r6 = cardOf(out, 'single_action_points')
    expect(r6).toContain('미션 50 포인트 · 컬렉션 완성 20 포인트')
    expect(r6).toContain('href="#rule-point_reward_max"')
    expect(r6).toContain('항목별 포인트(R5)에서 바꿔요')
    expect(r6).not.toContain('inputMode="numeric"')
    const r7 = cardOf(out, 'count_ladder_points')
    expect(r7).toContain('>100 포인트<')
    expect(r7).not.toContain('inputMode="numeric"')
  })

  it('R5를 바꿔 저장해 넘긴 값이 R6·R7 표시에 따라 반영된다', () => {
    const changed = seedRecords({
      point_reward_max: {
        value: {
          kinds: {
            count_badge: { max: 10, provisional: true },
            achievement_badge: { max: 80, provisional: false },
            mission: { max: 40, provisional: true },
            collection_completion: { max: 20, provisional: false },
            recipe: { max: 30, provisional: false },
          },
        },
      },
    })
    const markup = flat(<OpsBalanceSettings rules={changed} openCollectionsNow={30} />)
    expect(cardOf(markup, 'single_action_points')).toContain('미션 40 포인트 · 컬렉션 완성 20 포인트')
    expect(cardOf(markup, 'count_ladder_points')).toContain('>80 포인트<')
  })

  it('R8은 경제 정책 키를 칩 목록으로 보이고 안내가 있다(입력 칸은 없다)', () => {
    const card = cardOf(out, 'economy_keys')
    expect(card).toContain('>rarity_common<')
    expect(card).toContain('>completion_decay<')
    expect(card).toContain('드랍 확률·믹스 정책의 값 키 이름이 항목에 있으면 알려요')
    expect(card).not.toContain('inputMode="numeric"')
  })

  it('R1~R4의 결과 문장은 채원 확정 문구다(값은 허용하는 최대 수)', () => {
    expect(cardOf(out, 'open_collections_max')).toContain('열려 있을 컬렉션이 7개째가 되면 알려요')
    expect(cardOf(out, 'weekly_new_collections_max')).toContain('한 주(월~일)에 2개째부터 알려요')
    expect(cardOf(out, 'rolling_new_collections_max')).toContain('공개 시각부터 거슬러 28일 안에 3개째부터 알려요. 예약·게재 중인 다른 기획도 같이 세요')
    expect(cardOf(out, 'launch_lead_days_min')).toContain('공개까지 28일보다 적게 남으면 알려요')
  })

  it('경고 수준 선택이 카드마다 있고 저장된 수준(주의)을 보인다', () => {
    expect(out.match(/>경고 수준<\/label>/g)).toHaveLength(8)
    expect(cardOf(out, 'open_collections_max')).toMatch(/role="combobox"[^>]*>[^]*?주의/)
  })
})

describe('OpsBalanceSettings — R1 「지금 서비스」 상자', () => {
  it('열린 컬렉션이 기준보다 많으면 채원 확정 문구다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords()} openCollectionsNow={30} />)
    const card = cardOf(out, 'open_collections_max')
    expect(card).toContain('지금 서비스')
    expect(card).toContain('지금 열린 컬렉션은 30개예요. 기준(6개)보다 24개 많아서 새 컬렉션을 여는 기획에는 주의가 계속 떠요.')
    // 상자는 R1 카드에만 있다
    expect(out.match(/지금 서비스/g)).toHaveLength(1)
  })

  it('열린 컬렉션 수를 못 읽으면 그 문구를 보이고 카드는 저장할 수 있다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords()} openCollectionsNow={null} />)
    const card = cardOf(out, 'open_collections_max')
    expect(card).toContain('열린 컬렉션 수를 읽지 못했어요')
    expect(card).toContain('저장하기')
    expect(cardOf(out, 'weekly_new_collections_max')).not.toContain('열린 컬렉션 수를 읽지 못했어요')
  })
})

describe('OpsBalanceSettings — 칩과 저장 전 상태', () => {
  const out = flat(<OpsBalanceSettings rules={seedRecords()} openCollectionsNow={30} />)

  it('「임시값·실측 전」 칩은 임시값이 켜진 규칙(R1·R2·R3·R5)에만 붙고 R4·R6·R7·R8에는 없다', () => {
    for (const key of ['open_collections_max', 'weekly_new_collections_max', 'rolling_new_collections_max', 'point_reward_max']) {
      expect(cardOf(out, key)).toContain('임시값·실측 전')
    }
    for (const key of ['launch_lead_days_min', 'single_action_points', 'count_ladder_points', 'economy_keys']) {
      expect(cardOf(out, key)).not.toContain('임시값·실측 전')
    }
  })

  it('임시값 체크는 임시값 칸마다 있고 R5는 종류마다 따로 있다', () => {
    expect(cardOf(out, 'open_collections_max').match(/role="checkbox"/g)).toHaveLength(1)
    expect(cardOf(out, 'point_reward_max').match(/role="checkbox"/g)).toHaveLength(5)
    // R5: 횟수형(임시값)·미션(임시값)만 켜져 있다
    expect(cardOf(out, 'point_reward_max').match(/role="checkbox"[^>]*aria-checked="true"/g)).toHaveLength(2)
    expect(cardOf(out, 'single_action_points')).not.toContain('role="checkbox"')
  })

  it('같은 이름의 임시값 체크는 접근 가능한 이름에 값 칸 이름표가 앞에 붙는다(R5 종류별)', () => {
    const card = cardOf(out, 'point_reward_max')
    expect(card).toContain('aria-labelledby="rule-point_reward_max-kinds-mission-max-label rule-point_reward_max-kinds-mission-provisional-text"')
    expect(card).toContain('id="rule-point_reward_max-kinds-mission-provisional-text"')
  })

  it('바꾼 것이 없으면 「저장 전」 칩이 없고 [저장하기]가 비활성이며 「바꾼 내용 취소」도 없다', () => {
    expect(out).not.toContain('저장 전')
    expect(out).not.toContain('바꾼 내용 취소')
    const saves = [...out.matchAll(/<button([^>]*)type="submit"([^>]*)>저장하기<\/button>/g)]
    expect(saves).toHaveLength(8)
    expect(saves.every((m) => m[2].includes('disabled'))).toBe(true)
  })

  it('켜기 스위치와 글자 「켜짐」이 카드마다 있고 터치 영역(min-h-11)이 있다', () => {
    expect(out.match(/role="switch"/g)).toHaveLength(8)
    expect(out.match(/>켜짐</g)).toHaveLength(8)
    expect(out).toContain('min-h-11')
  })

  it('오류 문장은 아직 없다(칸을 떠나기 전)', () => {
    expect(out).not.toContain('role="alert"')
    expect(out).not.toContain('aria-invalid')
  })

  it('저장된 값부터 틀린 칸은 칸을 떠나기 전에도 오류 문장이 보인다(R1 값 0, 조각 B 게이트 WARN 1)', () => {
    const broken = flat(<OpsBalanceSettings rules={seedRecords({ open_collections_max: { value: { max: 0, provisional: true } } })} openCollectionsNow={30} />)
    const card = cardOf(broken, 'open_collections_max')
    expect(card).toContain('1 이상의 정수로 적어 주세요')
    expect(card).toContain('aria-invalid="true"')
    expect(cardOf(broken, 'weekly_new_collections_max')).not.toContain('aria-invalid')
  })

  it('저장 결과를 읽어 주는 영역(aria-live)이 카드마다 있다', () => {
    expect(out.match(/aria-live="polite"/g)).toHaveLength(8)
  })
})

describe('OpsBalanceSettings — 마지막 변경과 직전 값', () => {
  it('한 번도 안 바꿨으면 「처음 값 그대로예요」이고 되돌리기 버튼이 없다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords()} openCollectionsNow={30} />)
    expect(out.match(/처음 값 그대로예요/g)).toHaveLength(8)
    expect(out).not.toContain('직전 값으로 되돌리기')
    expect(out).not.toContain('마지막으로 바꾼 사람')
  })

  it('바꿨으면 「마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20」과 「직전 값」이 보이고 [직전 값으로 되돌리기]가 나온다', () => {
    const out = flat(
      <OpsBalanceSettings
        rules={seedRecords({
          open_collections_max: { value: { max: 9, provisional: false }, updatedBy: 'admin-1', previousValue: { max: 6, provisional: true } },
        })}
        openCollectionsNow={30}
      />
    )
    const card = cardOf(out, 'open_collections_max')
    expect(card).toContain('마지막으로 바꾼 사람 관리자 · 10/1(목) 15:20')
    expect(card).toContain('직전 값 6개')
    expect(card).toContain('직전 값으로 되돌리기')
    expect(card).toMatch(/id="rule-open_collections_max-max"[^>]*value="9"/)
    expect(card).not.toContain('임시값·실측 전') // 임시값 표시를 끈 값으로 저장했다
    expect(out.match(/처음 값 그대로예요/g)).toHaveLength(7)
  })

  it('켜기·수준만 바꾼 규칙은 값은 처음 그대로라고 말한다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords({ economy_keys: { updatedBy: 'admin-1', enabled: false } })} openCollectionsNow={30} />)
    expect(cardOf(out, 'economy_keys')).toContain('값은 처음 그대로예요')
  })
})

describe('OpsBalanceSettings — 꺼짐 안내와 수준', () => {
  it('꺼 둔 규칙은 「꺼짐」과 안내 문구를 보이고 카드를 흐리게 하지 않는다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords({ weekly_new_collections_max: { enabled: false } })} openCollectionsNow={30} />)
    const card = cardOf(out, 'weekly_new_collections_max')
    expect(card).toContain('>꺼짐<')
    expect(card).toContain('꺼 두면 이 규칙은 경고를 만들지 않아요')
    // 카드 틀(바깥 div)에 흐림 클래스가 없다. 입력·버튼 안의 disabled 상태 클래스는 따로 본다.
    const frame = out.match(/<div class="([^"]*)" id="rule-weekly_new_collections_max">/)
    expect(frame?.[1]).toBeDefined()
    expect(frame?.[1]).not.toContain('opacity')
    expect(out.match(/꺼 두면 이 규칙은 경고를 만들지 않아요/g)).toHaveLength(1)
  })

  it('R8을 끄면 경제 수치 전용 문구가 나온다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords({ economy_keys: { enabled: false } })} openCollectionsNow={30} />)
    expect(cardOf(out, 'economy_keys')).toContain('꺼 두면 항목에 드랍 확률 같은 경제 수치가 들어 있어도 알려 주지 않아요')
    expect(cardOf(out, 'economy_keys')).not.toContain('꺼 두면 이 규칙은 경고를 만들지 않아요')
  })

  it('R5를 끄면 보상 배지가 없는 항목의 포인트 초과는 알려 주지 않는다는 문구가 R5 카드에 나온다(조각 A 게이트 발견물 ③)', () => {
    const off = flat(<OpsBalanceSettings rules={seedRecords({ point_reward_max: { enabled: false } })} openCollectionsNow={30} />)
    expect(cardOf(off, 'point_reward_max')).toContain('R5를 끄면 보상 배지가 없는 항목의 포인트 초과는 알려 주지 않아요')
    const on = flat(<OpsBalanceSettings rules={seedRecords()} openCollectionsNow={30} />)
    expect(on).not.toContain('R5를 끄면 보상 배지가 없는 항목의 포인트 초과는 알려 주지 않아요')
  })

  it('참고로 낮춘 규칙은 수준 선택에 「참고」가 보인다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords({ launch_lead_days_min: { level: 'info' } })} openCollectionsNow={30} />)
    expect(cardOf(out, 'launch_lead_days_min')).toMatch(/role="combobox"[^>]*>[^]*?참고/)
  })
})

describe('OpsBalanceSettings — 구역 상태', () => {
  it('규칙을 읽지 못하면 이 구역만 오류 카드와 [새로 고치기]가 보인다', () => {
    const out = flat(<OpsBalanceSettings rules={null} openCollectionsNow={null} />)
    expect(out).toContain('밸런스 규칙을 불러오지 못했어요')
    expect(out).toContain('서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요')
    expect(out).toContain('새로 고치기')
    expect(out).not.toContain('<form')
  })

  it('규칙이 아직 등록되지 않았으면 안내 카드다', () => {
    const out = flat(<OpsBalanceSettings rules={[]} openCollectionsNow={30} />)
    expect(out).toContain('밸런스 규칙이 아직 등록되지 않았어요')
    expect(out).toContain('개발 쪽에 마이그레이션 적용을 요청해 주세요')
    expect(out).not.toContain('<form')
  })

  it('일부 규칙만 있으면 있는 규칙만 그리고 규칙이 없는 그룹 제목은 그리지 않는다', () => {
    const out = flat(<OpsBalanceSettings rules={seedRecords().filter((rule) => rule.ruleKey === 'open_collections_max')} openCollectionsNow={30} />)
    expect(out.match(/<form /g)).toHaveLength(1)
    expect([...out.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1])).toEqual(['컬렉션 개방'])
  })
})

describe('OpsSettingsSection·OpsSettingsNav', () => {
  it('구역 틀은 제목(h2)과 설명 문단을 그리고 앵커 ID와 scroll-mt를 갖는다', () => {
    const out = flat(
      <OpsSettingsSection id="balance" title="밸런스 규칙" description={['첫째 설명', '둘째 설명']}>
        <p>본문</p>
      </OpsSettingsSection>
    )
    expect(out).toContain('id="balance"')
    expect(out).toContain('aria-labelledby="balance-title"')
    expect(out).toContain('>밸런스 규칙</h2>')
    expect(out).toContain('첫째 설명')
    expect(out).toContain('둘째 설명')
    expect(out).toContain('scroll-mt-20')
    expect(out).toContain('본문')
  })

  it('구역이 2개 미만이면 이동 링크를 그리지 않는다', () => {
    expect(flat(<OpsSettingsNav sections={[]} />)).toBe('')
    expect(flat(<OpsSettingsNav sections={[{ id: 'balance', label: '밸런스 규칙' }]} />)).toBe('')
  })

  it('구역이 2개 이상이면 구역마다 #앵커 링크가 있고 터치 영역이 44px다', () => {
    const out = flat(
      <OpsSettingsNav
        sections={[
          { id: 'balance', label: '밸런스 규칙' },
          { id: 'signals', label: '신호 기준값' },
        ]}
      />
    )
    expect(out).toContain('aria-label="설정 구역"')
    expect(out).toContain('href="#balance"')
    expect(out).toContain('href="#signals"')
    expect(out).toContain('min-h-11')
    expect(out).toContain('sticky')
  })
})
