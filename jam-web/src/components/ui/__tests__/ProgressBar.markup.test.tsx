/**
 * ProgressBar 마크업 고정 (티켓 20261107_2156)
 *
 * `as` prop(기본 'div')을 더하면서 기존 호출부 10곳의 렌더 결과가 한 글자도 바뀌지 않았음을 못 박는다.
 * EXPECTED는 **`as`를 더하기 전의 ProgressBar.jsx**를 `renderToStaticMarkup`한 결과다(수정 후 코드에서 뽑은 값이 아니다).
 * 기본 경로의 마크업을 일부러 바꿀 때만 이 값을 고친다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 확인한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'

type Props = React.ComponentProps<typeof ProgressBar>

// <CASES-BEGIN>
const CASES: Record<string, Props> = {
  // 실제 호출 10곳(호출 시점의 prop 그대로, 값은 대표값)
  'OnboardingQuestCard 실제 단계(204)': { current: 2, total: 5, labelType: 'none' },
  'OnboardingQuestCard 연출(257)': { current: 0, total: 4, labelType: 'none' },
  'TodayStatusStrip(64)': { current: 3, total: 10 },
  'collections/page(250)': { percent: 40, height: 6 },
  'ItemBookHeroSection(136)': { percent: 30 },
  'inventory/page(96)': { percent: Math.min(100, (7 / 10) * 100), height: 6, labelType: 'none' },
  'MissionDetailClient 진행 중(632)': { percent: 45 },
  'MissionDetailClient 완료(632)': { percent: 100 },
  'MissionStatusClient(292)': {
    percent: 0.5 * 100,
    labelType: 'none',
    height: 6,
    color: 'var(--accent)',
    trackColor: 'var(--accent-soft-hover)',
    radius: '3px',
  },
  'RankingListRow(108)': {
    percent: 0.8 * 100,
    labelType: 'none',
    height: 6,
    color: 'var(--accent)',
    trackColor: 'var(--border)',
    radius: '3px',
  },
  'CollectionGridCard(85)': { percent: 60, height: 6 },
  // 일반 조합
  '라벨 percent × inline': { percent: 42, labelType: 'percent', labelPosition: 'inline' },
  '라벨 percent × top': { percent: 42, labelType: 'percent', labelPosition: 'top' },
  '라벨 fraction × inline': { current: 3, total: 10, labelType: 'fraction', labelPosition: 'inline' },
  '라벨 fraction × top': { current: 3, total: 10, labelType: 'fraction', labelPosition: 'top' },
  '라벨 fraction인데 current 없음': { total: 10, labelType: 'fraction' },
  'track-gradient': { percent: 35, fillMode: 'track-gradient', trackColor: 'var(--progress-track)', height: 10 },
  'track-gradient 사용자 gradient': { percent: 35, fillMode: 'track-gradient', gradient: 'linear-gradient(red, blue)' },
  'outlined + trackColor': { percent: 35, outlined: true, trackColor: 'var(--background)', height: 10, labelType: 'none' },
  'outlined + track-gradient': {
    percent: 100,
    outlined: true,
    fillMode: 'track-gradient',
    trackColor: 'var(--background)',
    height: 10,
    labelType: 'none',
  },
  'className': { percent: 10, className: 'mt-2' },
  'className + 라벨': { percent: 10, labelType: 'percent', className: 'mt-2' },
  // 폭 계산 경계
  'percent 0': { percent: 0 },
  'percent 100': { percent: 100 },
  'percent 음수 clamp': { percent: -20 },
  'percent 100 초과 clamp': { percent: 140 },
  'total 0': { current: 3, total: 0 },
  'total 없음': { current: 3 },
  'current 없음 total 있음': { total: 8 },
}
// <CASES-END>

const EXPECTED: Record<string, string> = {
  'OnboardingQuestCard 실제 단계(204)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:40%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'OnboardingQuestCard 연출(257)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'TodayStatusStrip(64)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:30%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'collections/page(250)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:6px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:40%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'ItemBookHeroSection(136)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:30%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'inventory/page(96)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:6px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:70%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'MissionDetailClient 진행 중(632)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:45%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'MissionDetailClient 완료(632)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:100%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'MissionStatusClient(292)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:6px;border-radius:3px;overflow:hidden;background:var(--accent-soft-hover)"><div style="position:absolute;inset:0;left:0;width:50%;height:100%;border-radius:3px;background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'RankingListRow(108)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:6px;border-radius:3px;overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:80%;height:100%;border-radius:3px;background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'CollectionGridCard(85)':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:6px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:60%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  '라벨 percent × inline':
    '<div class="" style="display:flex;align-items:center;gap:var(--spacing-12);width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:42%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div><span style="font-size:var(--text-sm);font-weight:700;color:var(--foreground);font-variant-numeric:tabular-nums;white-space:nowrap">42%</span></div>',
  '라벨 percent × top':
    '<div class="" style="display:flex;flex-direction:column;gap:var(--spacing-8);width:100%"><div style="display:flex;justify-content:flex-end"><span style="font-size:var(--text-sm);font-weight:700;color:var(--foreground);font-variant-numeric:tabular-nums;white-space:nowrap">42%</span></div><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:42%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  '라벨 fraction × inline':
    '<div class="" style="display:flex;align-items:center;gap:var(--spacing-12);width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:30%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div><span style="font-size:var(--text-sm);font-weight:700;color:var(--link);font-variant-numeric:tabular-nums;white-space:nowrap">3/10</span></div>',
  '라벨 fraction × top':
    '<div class="" style="display:flex;flex-direction:column;gap:var(--spacing-8);width:100%"><div style="display:flex;justify-content:flex-end"><span style="font-size:var(--text-sm);font-weight:700;color:var(--link);font-variant-numeric:tabular-nums;white-space:nowrap">3/10</span></div><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:30%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  '라벨 fraction인데 current 없음':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'track-gradient':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:10px;border-radius:var(--radius-full);overflow:hidden;background:var(--progress-track)"><div style="position:absolute;inset:0;border-radius:var(--radius-full);background:var(--progress-sweep);--ds-progress-fill:35%;clip-path:inset(0 calc(100% - var(--ds-progress-fill)) 0 0);transition:clip-path var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'track-gradient 사용자 gradient':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;border-radius:var(--radius-full);background:linear-gradient(red, blue);--ds-progress-fill:35%;clip-path:inset(0 calc(100% - var(--ds-progress-fill)) 0 0);transition:clip-path var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'outlined + trackColor':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:10px;border-radius:var(--radius-full);overflow:hidden;background:var(--background);box-sizing:border-box;border:1px solid var(--border)"><div style="position:absolute;inset:0;left:0;width:35%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'outlined + track-gradient':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:10px;border-radius:var(--radius-full);overflow:hidden;background:var(--background);box-sizing:border-box;border:1px solid var(--border)"><div style="position:absolute;inset:0;border-radius:var(--radius-full);background:var(--progress-sweep);--ds-progress-fill:100%;clip-path:inset(0 calc(100% - var(--ds-progress-fill)) 0 0);transition:clip-path var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'className':
    '<div class="mt-2" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:10%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'className + 라벨':
    '<div class="mt-2" style="display:flex;align-items:center;gap:var(--spacing-12);width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:10%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div><span style="font-size:var(--text-sm);font-weight:700;color:var(--foreground);font-variant-numeric:tabular-nums;white-space:nowrap">10%</span></div>',
  'percent 0':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'percent 100':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:100%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'percent 음수 clamp':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'percent 100 초과 clamp':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:100%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'total 0':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'total 없음':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
  'current 없음 total 있음':
    '<div class="" style="width:100%"><div style="flex:1;position:relative;height:8px;border-radius:var(--radius-full);overflow:hidden;background:var(--border)"><div style="position:absolute;inset:0;left:0;width:0%;height:100%;border-radius:var(--radius-full);background:var(--accent);transition:width var(--duration-slow) var(--ease-smooth-out)"></div></div></div>',
}

describe('ProgressBar 기본 경로 마크업 — 기존 호출부 불변', () => {
  for (const [name, props] of Object.entries(CASES)) {
    it(`${name}: 수정 전 마크업과 한 글자도 다르지 않다`, () => {
      expect(renderToStaticMarkup(<ProgressBar {...props} />)).toBe(EXPECTED[name])
    })
    it(`${name}: as="div"를 명시해도 기본과 같다`, () => {
      expect(renderToStaticMarkup(<ProgressBar {...props} as="div" />)).toBe(EXPECTED[name])
    })
  }
})

describe('ProgressBar shape (티켓 20261114_1502)', () => {
  it('shape="flat"을 명시해도 기본과 같다', () => {
    for (const [name, props] of Object.entries(CASES)) {
      expect(renderToStaticMarkup(<ProgressBar {...props} shape="flat" />), name).toBe(EXPECTED[name])
    }
  })

  it('capsule: 어두운 트랙 + 안쪽 2px 여백 + 둥근 채움, 채움 기본색은 --capsule-fill이다', () => {
    const html = renderToStaticMarkup(<ProgressBar shape="capsule" percent={50} height={16} />)
    expect(html).toContain('height:16px')
    expect(html).toContain('box-sizing:border-box')
    expect(html).toContain('padding:2px')
    expect(html).toContain('background:var(--capsule-track)')
    expect(html).toContain('background:var(--capsule-fill)')
    expect(html).toContain('border-radius:var(--radius-full)')
    expect(html).toContain('transition:width var(--duration-slow) var(--ease-smooth-out)')
    // 게이지 전용 장식은 가져오지 않는다
    expect(html).not.toMatch(/box-shadow|border:|role=|aria-/)
  })

  it('capsule: color·trackColor로 덮어쓴다(컬렉션은 --jam-green)', () => {
    const html = renderToStaticMarkup(<ProgressBar shape="capsule" percent={50} height={16} color="var(--jam-green)" trackColor="var(--background)" />)
    expect(html).toContain('background:var(--jam-green)')
    expect(html).toContain('background:var(--background)')
    expect(html).not.toContain('--capsule-fill')
    expect(html).not.toContain('--capsule-track')
  })

  it('capsule: 채움 너비는 calc(원지름 + (100% - 원지름) × 비율)이고 원지름은 height - 4다', () => {
    expect(renderToStaticMarkup(<ProgressBar shape="capsule" percent={30} height={16} />)).toContain('width:calc(12px + (100% - 12px) * 0.3)')
    expect(renderToStaticMarkup(<ProgressBar shape="capsule" percent={100} height={12} />)).toContain('width:calc(8px + (100% - 8px) * 1)')
  })

  it('capsule: 0%이면 채움 너비가 0이다(진행한 것처럼 읽히는 점이 없다)', () => {
    const html = renderToStaticMarkup(<ProgressBar shape="capsule" percent={0} height={16} />)
    expect(html).toContain('width:0px')
    expect(html).not.toContain('calc(')
  })

  it('capsule: 숫자 height가 아니면 flat으로 그린다', () => {
    const html = renderToStaticMarkup(<ProgressBar shape="capsule" percent={50} height="1rem" />)
    expect(html).not.toContain('--capsule-')
    expect(html).toContain('background:var(--border)')
    expect(html).toContain('background:var(--accent)')
  })

  it('capsule + as="span": div가 없다', () => {
    const html = renderToStaticMarkup(<ProgressBar shape="capsule" percent={50} height={16} as="span" />)
    expect(html).not.toContain('<div')
  })

  it('CapsuleGauge와 트랙·채움 토큰 문자열이 같다(드리프트 방지)', () => {
    const gauge = readFileSync(join(__dirname, '../../capsule/CapsuleGauge.tsx'), 'utf8')
    const bar = renderToStaticMarkup(<ProgressBar shape="capsule" percent={50} height={36} />)
    for (const token of ['var(--capsule-track)', 'var(--capsule-fill)']) {
      expect(gauge).toContain(`background: '${token}'`)
      expect(bar).toContain(`background:${token}`)
    }
  })
})

describe('ProgressBar as="span"', () => {
  for (const [name, props] of Object.entries(CASES)) {
    it(`${name}: div가 하나도 없고, 태그명과 display:block 말고는 div 마크업과 같다`, () => {
      const span = renderToStaticMarkup(<ProgressBar {...props} as="span" />)
      const div = renderToStaticMarkup(<ProgressBar {...props} />)
      expect(span).not.toContain('<div')
      expect(span).not.toContain('</div>')
      expect(span.replaceAll('display:block;', '')).toBe(div.replaceAll('<div', '<span').replaceAll('</div>', '</span>'))
    })
  }

  it('라벨이 없는 경로: 바깥·트랙에 display:block이 붙고 채움에는 붙지 않는다', () => {
    const html = renderToStaticMarkup(<ProgressBar percent={50} height={6} as="span" />)
    expect(html.match(/display:block/g)).toHaveLength(2)
    expect(html).toMatch(/^<span class="" style="display:block;width:100%"><span style="display:block;flex:1;position:relative;height:6px/)
    expect(html).toContain('<span style="position:absolute;inset:0;left:0;width:50%;height:100%')
  })

  it('라벨이 있는 경로: flex 래퍼는 flex를 유지하고 트랙만 display:block이다', () => {
    for (const labelPosition of ['inline', 'top'] as const) {
      const html = renderToStaticMarkup(<ProgressBar percent={50} labelType="percent" labelPosition={labelPosition} as="span" />)
      expect(html.match(/display:block/g)).toHaveLength(1)
      expect(html).toContain('display:flex')
      expect(html).toContain('>50%</span>')
    }
  })

  it('track-gradient: 채움 span에 clip-path와 --ds-progress-fill이 그대로 들어간다', () => {
    const html = renderToStaticMarkup(<ProgressBar percent={35} fillMode="track-gradient" as="span" />)
    expect(html).toContain('--ds-progress-fill:35%')
    expect(html).toContain('clip-path:inset(0 calc(100% - var(--ds-progress-fill)) 0 0)')
  })

  it('role·aria 속성을 더하지 않는다', () => {
    for (const as of ['div', 'span'] as const) {
      const html = renderToStaticMarkup(<ProgressBar percent={50} labelType="percent" as={as} />)
      expect(html).not.toContain('role=')
      expect(html).not.toContain('aria-')
    }
  })

  it('알 수 없는 값은 div로 그린다', () => {
    // @ts-expect-error -- 타입 밖 값이 들어와도 기본 마크업이 나오는지 확인하는 시험
    const html = renderToStaticMarkup(<ProgressBar percent={50} as="section" />)
    expect(html).toBe(renderToStaticMarkup(<ProgressBar percent={50} />))
  })
})
