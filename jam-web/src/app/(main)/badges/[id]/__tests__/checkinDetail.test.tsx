/**
 * 체크인 배지 상세 (2026-11-09 사용자 지시)
 *  - 아이템 배지의 등급 칩처럼 방문 횟수 칩 «×N»을 카드 안 같은 자리에 둔다(2회 이상일 때만).
 *  - 방문 기록 제목 오른쪽의 «총 N회»를 걷는다.
 *  - 하단 안내 문구를 줄였다.
 *  - «획득 조건» 카드를 두지 않는다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더와 소스 검사로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/checkinDetail.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => null }))
vi.mock('@/components/ui/BottomSheet', () => ({ default: () => null }))

import BadgeHeroSection from '@/components/BadgeHeroSection'
import PoiEarnHistory from '../PoiEarnHistory'
import VisitCountChip from '@/components/ui/VisitCountChip'
import { d, t } from '@/lib/i18n'

const BADGE = {
  image_url: null,
  name: '북한산',
  rarity: 'common' as const,
  description: '산 체크인 배지',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
}

const EARN = (id: string) => ({
  id,
  earned_at: '2026-11-09T00:00:00Z',
  triggered_by_activity_name: null,
  triggered_by_distance_km: null,
  triggered_by_activity_date: null,
  triggered_by_strava_id: null,
})

const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf-8')
const checkinBranch = page.slice(page.indexOf("badgeRow.type === 'checkin'"), page.indexOf('변형 1: 액티비티 배지'))

describe('방문 횟수 칩', () => {
  it('2회 이상이면 «×N» 칩과 읽는 문장을 그리고, 1회·0회·값 없음은 그리지 않는다', () => {
    expect(renderToStaticMarkup(<VisitCountChip count={3} />)).toContain('×3')
    expect(renderToStaticMarkup(<VisitCountChip count={3} />)).toContain('3번 방문했어요')
    for (const count of [1, 0, null, undefined]) expect(renderToStaticMarkup(<VisitCountChip count={count} />), String(count)).toBe('')
  })

  it('히어로 카드 안, 이름(제목) 바로 위 등급 칩 자리에 그려진다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned chipExtra={<VisitCountChip count={4} />} />)

    expect(html).toContain('×4')
    expect(html.indexOf('×4')).toBeLessThan(html.indexOf('<h1'))
    // Common 등급이라 등급 칩은 없고, 방문 횟수 칩이 그 자리를 쓴다
    expect(html).not.toContain('>Common<')
    // 등급 칩(md)과 같은 크기
    expect(html).toContain('padding:var(--chip-padding)')
  })

  it('체크인 상세 페이지가 방문 이력 행 수를 칩으로 넘기고 1회는 넘기지 않는다', () => {
    expect(checkinBranch).toContain('chipExtra={checkinEarns.length > 1 ? <VisitCountChip count={checkinEarns.length} /> : undefined}')
  })
})

describe('방문 기록', () => {
  it('제목만 있고 오른쪽의 «총 N회»가 없다', () => {
    const html = renderToStaticMarkup(<PoiEarnHistory poiEarns={[EARN('a'), EARN('b'), EARN('c')]} />)

    expect(html).toContain(d.badges.visitHistoryTitle)
    expect(html).not.toContain('총 3회')
    expect(html).not.toMatch(/총 \d+회/)
  })
})

describe('체크인 상세의 획득 조건 카드와 안내 문구', () => {
  it('획득 조건 카드를 그리지 않는다(체크인 갈래)', () => {
    expect(checkinBranch).not.toContain('<BadgeConditionCard')
    expect(checkinBranch).not.toContain('conditionCheckinBody')
    expect(Object.keys(d.badges)).not.toContain('conditionCheckinBody')
  })

  it('하단 안내는 두 문장으로 줄었고 반경 값은 그대로 들어간다', () => {
    const text = t(d.badges.checkinSafetyNotice, { radius: '50' })

    expect(text).toBe('표시된 위치 50m 안을 지나기만 해도 체크인돼요. 가기 어려운 곳이면 알려 주세요.')
    expect(text).not.toMatch(/위험한|굳이|도와드릴게요|까다로운/)
  })
})
