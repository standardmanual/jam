/**
 * 아이콘 세트 v2 (티켓 20261114_2345) — 39종 × 라인·채움
 *
 * 사양 docs/assets/prototypes/icon-set-v2/spec.json 과 서비스 icons.tsx · DS IconCatalog.jsx 두 사본을 대조한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentType, SVGProps } from 'react'

import * as service from '../icons'
import * as ds from '@ds/components/icons/IconCatalog'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { variant?: 'line' | 'fill' }>
interface SpecIcon {
  name: string
  oldName: string | null
  lineOnly: boolean
  svgInner48: string
}

const specPath = path.resolve(process.cwd(), '..', 'docs/assets/prototypes/icon-set-v2/spec.json')
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as { icons: SpecIcon[] }
const svc = service as unknown as Record<string, IconComponent>
const dsx = ds as unknown as Record<string, IconComponent>
const html = (C: IconComponent, props: Record<string, unknown> = {}) => renderToStaticMarkup(<C {...props} />)

const RENAMED: Record<string, string> = {
  TargetIcon: 'TicketIcon',
  PackageIcon: 'ArrowDownIcon',
  GiftIcon: 'ArrowUpIcon',
  BookIcon: 'MagicBookIcon',
  HourglassIcon: 'SparkleCircleIcon',
  GachaMachineIcon: 'MixingBowlIcon',
  ActivityIcon: 'SyncCircleIcon',
  CheckCircleIcon: 'CheckBoldIcon',
  XCircleIcon: 'XBoldIcon',
  RankingIcon: 'PodiumIcon',
}

describe('아이콘 세트 v2', () => {
  it('사양은 39종이다', () => {
    expect(spec.icons).toHaveLength(39)
  })

  describe.each(spec.icons.map((i) => [i.name, i] as const))('%s', (name, icon) => {
    it('서비스가 두 variant로 렌더하고 48 격자 aria-hidden SVG다', () => {
      for (const variant of ['line', 'fill']) {
        const out = html(svc[name], { variant })
        expect(out).toMatch(/^<svg[^>]*viewBox="0 0 48 48"/)
        expect(out).toContain('aria-hidden="true"')
        expect(out).toContain('class="w-6 h-6"')
      }
    })

    it('서비스와 DS 사본의 마크업이 두 variant 모두 같다', () => {
      for (const variant of ['line', 'fill']) {
        const a = html(svc[name], { variant, className: 'w-5 h-5' })
        const b = html(dsx[name], { variant, className: 'w-5 h-5' })
        expect(a).toBe(b)
      }
    })

    it('색은 currentColor·none·url(#…)뿐이다 (mask 안 보임/가림 신호 white·black 제외)', () => {
      for (const variant of ['line', 'fill']) {
        const out = html(svc[name], { variant }).replace(/<mask[\s\S]*?<\/mask>/g, '')
        const colors = [...out.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1])
        for (const c of colors) expect(c).toMatch(/^(currentColor|none|url\(#[^)]+\))$/)
        expect(out).not.toMatch(/var\(--bg|var\(--background/)
      }
    })

    if (icon.lineOnly) {
      it('lineOnly라 fill을 요청해도 라인과 같다', () => {
        expect(html(svc[name], { variant: 'fill' })).toBe(html(svc[name], { variant: 'line' }))
      })
    }
  })

  it('옛 이름 10개가 새 컴포넌트와 같은 함수인 별칭이다', () => {
    for (const [oldName, newName] of Object.entries(RENAMED)) {
      expect(svc[oldName], oldName).toBe(svc[newName])
    }
  })

  it('CoinIcon 기본 variant는 fill이다', () => {
    expect(html(svc.CoinIcon)).toBe(html(svc.CoinIcon, { variant: 'fill' }))
    expect(html(svc.CoinIcon)).not.toBe(html(svc.CoinIcon, { variant: 'line' }))
  })

  it('가림은 mask로 뚫고 같은 아이콘이 여럿이어도 mask id가 겹치지 않는다', () => {
    const two = renderToStaticMarkup(
      <>
        <svc.FlaskIcon />
        <svc.FlaskIcon />
      </>,
    )
    const ids = [...two.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
    expect(two).toContain('mask="url(#')
  })

  it('className으로 크기를 바꿀 수 있다', () => {
    expect(html(svc.CoinIcon, { className: 'w-4 h-4' })).toContain('class="w-4 h-4"')
  })

  it('선 굵기 3은 48 격자 기준이라 24px 렌더에서 1.5px다', () => {
    const out = html(svc.PinIcon, { variant: 'line' })
    expect(out).toContain('stroke-width="3"')
  })
})
