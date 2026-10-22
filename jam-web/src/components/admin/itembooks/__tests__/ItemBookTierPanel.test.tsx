/**
 * 컬렉션 4등급 방식 패널의 보기 (티켓 20261022_1139 1회)
 *
 * jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 훅 없는 표시 컴포넌트(`ItemBookTierPanelView`)를 서버 렌더
 * (`renderToStaticMarkup`)로 그려 확인한다. 확인창과 조회·쓰기 호출은 눌러야 열리거나 브라우저가 필요해 여기서 그리지 않는다
 * (라우트 시험이 같은 응답 규칙을 고정한다).
 *
 * 확인하는 것: 로딩·실패·빈 상태, 켜짐·꺼짐 표시, 켜기를 막는 이유가 숫자로 보이는지, 이름 점검이 경고로만 보이고
 * 켜기를 막지 않는지, 끄기를 막는 이유, 한국어 줄바꿈 클래스.
 * 서버 렌더는 이어 붙은 글자 사이에 `<!-- -->`를 끼우므로 주석을 지운 글로 비교한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/admin/itembooks/__tests__/ItemBookTierPanel.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

import { ItemBookTierPanelView, type ItemBookTierPanelViewProps } from '../ItemBookTierPanel'
import type { TierReadiness } from '@/lib/itembook/tier-readiness'

function readiness(overrides: Partial<TierReadiness> = {}): TierReadiness {
  return {
    names: {
      nameCount: 2,
      rows: [
        { name: '가', counts: { common: 1, rare: 1, epic: 1, mystic: 1 }, noTierCount: 0, tierCount: 4, hasDuplicateTier: false },
        { name: '나', counts: { common: 1, rare: 1, epic: 1, mystic: 1 }, noTierCount: 0, tierCount: 4, hasDuplicateTier: false },
      ],
      duplicateTierNameCount: 0,
      tierCountGroups: [{ tierCount: 4, nameCount: 2 }],
      tierCountMismatch: false,
      noTierBadgeCount: 0,
    },
    distribution: {
      slotCount: 5,
      userCount: 3,
      userCountByTier: { common: 2, rare: 1, epic: 0, mystic: 0 },
      noTierSlotCount: 0,
      multiTierUserCount: 0,
      multiTierCombos: [],
    },
    tierCompletionCount: 0,
    canEnable: true,
    canDisable: true,
    ...overrides,
  }
}

function render(overrides: Partial<ItemBookTierPanelViewProps> = {}): string {
  const props: ItemBookTierPanelViewProps = {
    status: 'ready',
    tierMode: false,
    readiness: readiness(),
    loadError: null,
    busy: false,
    actionError: null,
    onToggle: () => undefined,
    onRetry: () => undefined,
    ...overrides,
  }
  return renderToStaticMarkup(<ItemBookTierPanelView {...props} />).replace(/<!-- -->/g, '')
}

/** 라벨이 정확히 일치하는 버튼 태그를 찾는다 */
function button(out: string, label: string): string {
  const match = out.match(new RegExp(`<button[^>]*>${label}</button>`))
  if (!match) throw new Error(`버튼 «${label}»을 찾지 못했어요`)
  return match[0]
}

describe('ItemBookTierPanelView — 로딩·실패', () => {
  it('로딩 중에는 안내와 자리 표시만 있고 켜기·끄기 버튼이 없다', () => {
    const out = render({ status: 'loading', readiness: null })
    expect(out).toContain('켜기 전 점검 결과를 불러오는 중이에요.')
    expect(out).toContain('aria-busy="true"')
    expect(out).not.toContain('4등급 방식 켜기')
    expect(out).not.toContain('4등급 방식 끄기')
  })

  it('실패하면 이유와 다시 불러오기 버튼을 보이고 켜기 버튼은 없다', () => {
    const out = render({ status: 'error', readiness: null, loadError: '점검 결과를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요.' })
    expect(out).toContain('점검 결과를 보여 줄 수 없어요')
    expect(out).toContain('서버에서 조회 중 오류가 났어요.')
    expect(out).toContain('다시 불러오기')
    expect(out).not.toContain('4등급 방식 켜기')
  })
})

describe('ItemBookTierPanelView — 꺼짐 상태', () => {
  it('막히는 점검이 없으면 꺼짐 표시와 눌러도 되는 켜기 버튼이 나온다', () => {
    const out = render()
    expect(out).toContain('꺼짐')
    expect(out).toContain('장착 5개, 장착한 유저 3명이에요.')
    expect(out).toContain('Common 2명 · Rare 1명 · Epic 0명 · Mystic 0명')
    expect(out).toContain('여러 등급을 장착한 유저가 없어요. 이 점검은 통과예요.')
    expect(button(out, '4등급 방식 켜기')).not.toContain('disabled=""')
  })

  it('여러 등급을 장착한 유저가 있으면 숫자와 조합을 보이고 켜기 버튼이 잠긴다', () => {
    const base = readiness()
    const out = render({
      readiness: readiness({
        canEnable: false,
        distribution: {
          ...base.distribution,
          multiTierUserCount: 3,
          multiTierCombos: [
            { tiers: ['common', 'rare'], userCount: 2 },
            { tiers: ['rare', 'epic', 'mystic'], userCount: 1 },
          ],
        },
      }),
    })
    expect(out).toContain('여러 등급을 장착한 유저가 3명 있어요')
    expect(out).toContain('Common + Rare: 2명')
    expect(out).toContain('Rare + Epic + Mystic: 1명')
    expect(out).toContain('정리는 이 화면에서 하지 않아요.')
    expect(out).toContain('여러 등급을 장착한 유저가 있어서 켤 수 없어요.')
    expect(button(out, '4등급 방식 켜기')).toContain('disabled=""')
  })

  it('이름 점검 경고는 경고로만 보이고 켜기 버튼을 잠그지 않는다', () => {
    const base = readiness()
    const out = render({
      readiness: readiness({
        names: {
          ...base.names,
          duplicateTierNameCount: 1,
          tierCountMismatch: true,
          tierCountGroups: [
            { tierCount: 1, nameCount: 1 },
            { tierCount: 4, nameCount: 1 },
          ],
        },
      }),
    })
    expect(out).toContain('이름을 맞춰야 완성되는 칸이 있어요')
    expect(out).toContain('같은 이름에 같은 등급 배지가 둘 이상인 이름이 1개 있어요.')
    expect(out).toContain('이름마다 등급 수가 달라요.')
    expect(out).toContain('등급 수별로 1등급 1개, 4등급 1개예요.')
    expect(out).toContain('켜는 것은 막지 않아요.')
    expect(button(out, '4등급 방식 켜기')).not.toContain('disabled=""')
  })

  it('이름 표에서 같은 등급이 둘 이상인 칸을 눈에 띄게 한다', () => {
    const base = readiness()
    const out = render({
      readiness: readiness({
        names: {
          ...base.names,
          nameCount: 1,
          rows: [{ name: '새벽 러너', counts: { common: 2, rare: 0, epic: 0, mystic: 0 }, noTierCount: 0, tierCount: 1, hasDuplicateTier: true }],
          duplicateTierNameCount: 1,
          tierCountGroups: [{ tierCount: 1, nameCount: 1 }],
        },
      }),
    })
    expect(out).toContain('이름별 등급 보기 (1개)')
    expect(out).toContain('새벽 러너')
    expect(out).toMatch(/<td[^>]*font-semibold[^>]*>2<\/td>/)
  })
})

describe('ItemBookTierPanelView — 켜짐 상태', () => {
  it('등급별 완성 기록이 없으면 끄기 버튼을 누를 수 있다', () => {
    const out = render({ tierMode: true })
    expect(out).toContain('켜짐')
    expect(out).toContain('등급별 완성 기록이 아직 없어요.')
    expect(button(out, '4등급 방식 끄기')).not.toContain('disabled=""')
  })

  it('등급별 완성 기록이 있으면 건수를 보이고 끄기 버튼이 잠긴다', () => {
    const out = render({ tierMode: true, readiness: readiness({ tierCompletionCount: 2, canDisable: false }) })
    expect(out).toContain('등급별 완성 기록이 2건 있어요. 기록이 있는 컬렉션은 끌 수 없어요.')
    expect(out).toContain('등급별 완성 기록이 있어서 끌 수 없어요.')
    expect(button(out, '4등급 방식 끄기')).toContain('disabled=""')
  })
})

describe('ItemBookTierPanelView — 빈 상태, 요청 중, 거절 이유', () => {
  it('장착도 배지도 없는 컬렉션은 빈 상태 문구를 담담하게 보인다', () => {
    const base = readiness()
    const out = render({
      readiness: readiness({
        names: { ...base.names, nameCount: 0, rows: [], tierCountGroups: [], tierCountMismatch: false },
        distribution: { ...base.distribution, slotCount: 0, userCount: 0, userCountByTier: { common: 0, rare: 0, epic: 0, mystic: 0 } },
      }),
    })
    expect(out).toContain('아직 이 컬렉션에 장착한 유저가 없어요.')
    expect(out).toContain('아직 이 컬렉션에 아이템 배지가 없어요.')
    expect(out).not.toContain('여러 등급을 장착한 유저가 없어요. 이 점검은 통과예요.')
    expect(button(out, '4등급 방식 켜기')).not.toContain('disabled=""')
  })

  it('요청 중에는 진행형 라벨이고 버튼이 잠긴다', () => {
    const turningOn = render({ busy: true })
    expect(button(turningOn, '켜는 중')).toContain('disabled=""')
    const turningOff = render({ busy: true, tierMode: true })
    expect(button(turningOff, '끄는 중')).toContain('disabled=""')
  })

  it('켜기·끄기가 거절된 이유를 그대로 보인다', () => {
    const out = render({ actionError: '4등급 방식을 켜지 못했어요. 이 컬렉션에 여러 등급을 장착한 유저가 2명 있어요.' })
    expect(out).toContain('4등급 방식을 켜지 못했어요. 이 컬렉션에 여러 등급을 장착한 유저가 2명 있어요.')
  })

  it('한국어 문구에 줄바꿈 클래스가 붙는다', () => {
    const out = render()
    expect(out).toContain('break-keep')
    expect(out).toContain('wrap-break-word')
    expect(button(out, '4등급 방식 켜기')).toContain('whitespace-nowrap')
  })
})
