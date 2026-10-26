/**
 * 토스트 행의 문구 줄바꿈과 모서리 (티켓 20261026_1055)
 *
 * 긴 한국어 문구가 어절 중간에서 꺾이지 않아야 하고, 두 줄이 돼도 알약이 부풀지 않아야 한다.
 * - 문구 칸: `min-w-0 break-keep wrap-break-word` (UX_WRITING_GUIDELINE §3.2 표기 그대로).
 *   `min-w-0`이 없으면 flex 아이템의 기본 min-width:auto 때문에 공백 없는 긴 어절이 알약 밖으로 넘친다.
 * - 행: `items-start rounded-3xl`. 한 줄(높이 48px)에서 24px 모서리는 `rounded-full`과 같은 반원이고,
 *   두 줄(72px)에서도 모서리가 24px로 남는다. 아이콘은 첫 줄 옆에 붙는다.
 * - 아이콘 칸: `shrink-0`이 있어야 문구가 길어도 아이콘이 찌그러지지 않는다. `h-6 items-center`는 글자 한 줄과 같은 24px 줄 상자 안에
 *   아이콘을 가운데 놓는다(svg가 display:block이라 칸 높이가 16px로 줄어 `items-start`에서 아이콘이 4px 올라가는 것을 막는다).
 *
 * `ToastProvider`는 마운트 게이트(`useSyncExternalStore` 서버 스냅샷 false) 때문에 서버 렌더에서 포털을
 * 만들지 않으므로, 행만 따로 내보낸 `ToastRow`를 `renderToStaticMarkup`으로 확인한다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 실제 줄바꿈 높이는 확인하지 못한다.
 * 그 부분은 320px 실화면에서 `offsetHeight`로 잰다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ToastRow } from '../Toast'

type Item = Parameters<typeof ToastRow>[0]['item']

function render(type: Item['type'], message: string) {
  const item: Item = { id: `t-${type}`, message, type, closing: false }
  return renderToStaticMarkup(
    <ToastRow item={item} icon={<svg data-icon={type} />} onDismiss={() => {}} />
  )
}

/** 열린 태그에서 class 속성 값을 순서대로 꺼낸다(행, 아이콘 칸, 문구 칸 순). */
function classNames(html: string): string[] {
  return [...html.matchAll(/<(?:div|span)[^>]*\sclass="([^"]*)"/g)].map((m) => m[1])
}

describe('ToastRow — 문구 칸', () => {
  it('문구 span에 min-w-0 break-keep wrap-break-word가 있고 문구를 담는다', () => {
    const html = render('info', '이번에 잼 12,345만큼 받았어요')
    expect(html).toContain(
      '<span class="min-w-0 break-keep wrap-break-word">이번에 잼 12,345만큼 받았어요</span>'
    )
  })

  it('word-break를 어절 중간에서 끊는 값이나 말줄임은 쓰지 않는다', () => {
    const html = render('error', '문구')
    expect(html).not.toMatch(/\bbreak-all\b/)
    expect(html).not.toMatch(/\btruncate\b/)
    expect(html).not.toMatch(/\bline-clamp-/)
    expect(html).not.toMatch(/\bwhitespace-nowrap\b/)
  })
})

describe('ToastRow — 아이콘 칸', () => {
  it('아이콘 span이 글자 한 줄과 같은 24px 줄 상자(h-6)이고 shrink-0이다', () => {
    const html = render('success', '문구')
    expect(html).toContain('<span class="flex h-6 shrink-0 items-center text-snow/60"><svg data-icon="success"></svg></span>')
  })
})

describe('ToastRow — 행 모양', () => {
  it.each(['success', 'error', 'info'] as const)('%s 종류도 items-start rounded-3xl이다', (type) => {
    const [row] = classNames(render(type, '문구'))
    expect(row).toMatch(/\bitems-start\b/)
    expect(row).toMatch(/\brounded-3xl\b/)
  })

  it('행에 rounded-full과 items-center가 없다', () => {
    const [row] = classNames(render('info', '문구'))
    expect(row).not.toMatch(/\brounded-full\b/)
    expect(row).not.toMatch(/\bitems-center\b/)
  })

  it('한 줄 토스트의 나머지 모양(.t-toast, 간격, 색, 글자)은 그대로다', () => {
    const [row] = classNames(render('info', '문구'))
    for (const cls of [
      't-toast',
      'flex',
      'gap-2',
      'px-4',
      'py-3',
      'bg-background-inverse',
      'text-snow',
      'text-base',
      'pointer-events-auto',
    ]) {
      expect(row.split(' ')).toContain(cls)
    }
    // 열림 상태는 마운트 다음 프레임에 붙으므로 서버 렌더에는 없다.
    expect(row.split(' ')).not.toContain('is-open')
  })
})
