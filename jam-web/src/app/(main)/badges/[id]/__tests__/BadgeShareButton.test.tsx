/**
 * 배지 공유 시트 — 체크무늬 카드 한 장과 복사·저장·더보기 (티켓 20261115_1249)
 *
 * - 버튼 줄(`ShareActionButtons`): 복사하기(primary, CopyIcon)·저장하기(DownloadIcon)·더보기(MoreIcon) 순, `canShare`가 거짓이면 더보기가 없다
 * - 동작(`badgeShareActions`): 복사는 `image/png`를 클립보드에 쓰고 성공·미지원·실패 토스트, 더보기는 `navigator.share`를 부르고 취소는 조용히 넘김,
 *   저장은 iOS가 아니면 내려받기 뒤 성공 토스트, iOS는 안내 토스트 뒤 공유 시트
 * - 시트 본문: 캐러셀·기록 카드·기록 조회 API 호출이 없다(소스 확인)
 *
 * 저장소에 jsdom이 없어 (1) 훅이 없는 버튼 줄 컴포넌트가 돌려주는 엘리먼트 트리를 훑고, (2) 브라우저 API를 대역으로 바꿔 동작 함수를 직접 부른다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/BadgeShareButton.test.tsx"
 */
import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@ds/components/buttons/Button'
import { CopyIcon, DownloadIcon, MoreIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import { ShareActionButtons, SHARE_ACTION_BUTTON_CLASS } from '../ShareActionButtons'
import { copyImage, openShareSheet, saveImage } from '../badgeShareActions'

type El = ReactElement<Record<string, unknown>>

function collect(node: ReactNode, predicate: (el: El) => boolean): El[] {
  const found: El[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!isValidElement(value)) return
    const el = value as El
    if (predicate(el)) found.push(el)
    visit(el.props.children)
  }
  visit(node)
  return found
}

function buttonsOf(canNativeShare: boolean, copying = false) {
  const tree = ShareActionButtons({ copying, canNativeShare, onCopy: () => {}, onSave: () => {}, onMore: () => {} })
  return collect(tree, (el) => el.type === Button)
}

/** 버튼 안의 아이콘 컴포넌트와 이름표 글자 */
function parts(button: El) {
  const icon = collect(button.props.children as ReactNode, (el) => typeof el.type === 'function')[0]?.type
  const label = collect(button.props.children as ReactNode, (el) => el.type === 'span')[0]?.props.children
  return { icon, label }
}

describe('ShareActionButtons — 버튼 줄', () => {
  it('canShare가 참이면 복사하기·저장하기·더보기 순으로 아이콘과 이름표가 함께 있다', () => {
    const buttons = buttonsOf(true)
    expect(buttons.map((b) => parts(b))).toEqual([
      { icon: CopyIcon, label: '복사하기' },
      { icon: DownloadIcon, label: '저장하기' },
      { icon: MoreIcon, label: '더보기' },
    ])
  })

  it('canShare가 거짓이면 더보기를 그리지 않고 두 버튼만 남는다', () => {
    const buttons = buttonsOf(false)
    expect(buttons.map((b) => parts(b).label)).toEqual(['복사하기', '저장하기'])
  })

  it('복사하기만 primary이고 나머지는 secondary다(세 개 모두 primary 금지)', () => {
    const variants = buttonsOf(true).map((b) => b.props.variant ?? 'primary')
    expect(variants).toEqual(['primary', 'secondary', 'secondary'])
  })

  it('세 버튼은 같은 클래스(아이콘 위·이름표 아래, 줄바꿈 없음)와 전체 폭을 쓴다', () => {
    for (const b of buttonsOf(true)) {
      expect(b.props.className).toBe(SHARE_ACTION_BUTTON_CLASS)
      expect(b.props.fullWidth).toBe(true)
    }
    expect(SHARE_ACTION_BUTTON_CLASS).toContain('flex-col')
    expect(SHARE_ACTION_BUTTON_CLASS).toContain('whitespace-nowrap')
  })

  it('복사하는 동안에만 복사하기에 aria-busy가 붙는다', () => {
    expect(buttonsOf(true, true)[0].props['aria-busy']).toBe(true)
    expect(buttonsOf(true, false)[0].props['aria-busy']).toBeUndefined()
  })

  it('버튼 이름 문구가 ko.ts와 같다', () => {
    expect(d.badges.shareActionCopy).toBe('복사하기')
    expect(d.badges.shareActionDownload).toBe('저장하기')
    expect(d.badges.shareActionMore).toBe('더보기')
  })
})

describe('복사·더보기·저장 동작', () => {
  const blob = new Blob(['x'], { type: 'image/png' })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  class FakeClipboardItem {
    constructor(public items: Record<string, Blob>) {}
  }

  it('복사하기: image/png로 클립보드에 쓰고 성공 토스트를 띄운다', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    vi.stubGlobal('navigator', { clipboard: { write } })
    const toast = vi.fn()

    await copyImage(blob, toast)

    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]]
    expect(items).toHaveLength(1)
    expect(items[0].items['image/png']).toBe(blob)
    expect(toast).toHaveBeenCalledWith('이미지를 복사했어요', 'success')
  })

  it('복사하기: write를 시작하기 전에 await하지 않는다(Safari는 사용자 동작 안에서만 허용)', () => {
    const write = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    vi.stubGlobal('navigator', { clipboard: { write } })

    void copyImage(blob, vi.fn())

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('복사하기: ClipboardItem이나 clipboard.write가 없으면 저장하기를 안내하는 실패 토스트를 띄운다', async () => {
    vi.stubGlobal('navigator', {})
    const toast = vi.fn()

    await copyImage(blob, toast)

    expect(toast).toHaveBeenCalledWith(d.badges.shareCopyUnsupported, 'error')
    expect(d.badges.shareCopyUnsupported).toContain('저장하기')
  })

  it('복사하기: 쓰기가 거절되면 실패 토스트를 띄운다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    vi.stubGlobal('navigator', { clipboard: { write: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } })
    const toast = vi.fn()

    await copyImage(blob, toast)

    expect(toast).toHaveBeenCalledWith(d.badges.shareCopyError, 'error')
  })

  it('더보기: navigator.share에 파일 하나를 넘긴다', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, canShare: () => true })

    await openShareSheet(blob, '새벽 러너')

    expect(share).toHaveBeenCalledTimes(1)
    const [data] = share.mock.calls[0] as [{ files: File[] }]
    expect(data.files).toHaveLength(1)
    expect(data.files[0].name).toBe('새벽 러너-badge.png')
    expect(data.files[0].type).toBe('image/png')
  })

  it('더보기: 사용자가 공유 시트를 닫아도(AbortError) 오류를 남기지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(abort), canShare: () => true })

    await openShareSheet(blob, '배지')

    expect(error).not.toHaveBeenCalled()
  })

  function stubDownloadDom() {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild: vi.fn() },
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    return anchor
  }

  it('저장하기: iOS가 아니면 파일을 내려받고 성공 토스트를 띄운다', async () => {
    const share = vi.fn()
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5, share })
    const anchor = stubDownloadDom()
    const toast = vi.fn()

    await saveImage(blob, '새벽 러너', toast)

    expect(anchor.download).toBe('새벽 러너-badge.png')
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(share).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('이미지를 저장했어요', 'success')
  })

  it('저장하기: 내려받기가 실패하면 오류 토스트를 띄운다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('boom')
      },
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const toast = vi.fn()

    await saveImage(blob, '배지', toast)

    expect(toast).toHaveBeenCalledWith(d.badges.shareSaveError, 'error')
  })

  it('저장하기: iOS는 안내 토스트를 먼저 띄우고 OS 공유 시트를 연다(내려받기를 하지 않는다)', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      share,
      canShare: () => true,
    })
    const createElement = vi.fn()
    vi.stubGlobal('document', { createElement })
    const toast = vi.fn()

    await saveImage(blob, '배지', toast)

    expect(toast).toHaveBeenCalledWith(d.badges.shareSaveIOSHint, 'info')
    expect(share).toHaveBeenCalledTimes(1)
    expect(createElement).not.toHaveBeenCalled()
  })
})

describe('공유 시트 본문 소스', () => {
  const share = readFileSync(new URL('../BadgeShareButton.tsx', import.meta.url), 'utf-8')

  it('캐러셀·기록 카드·기록 조회 API 호출이 없다', () => {
    // 폐기한 이름이 소스에 다시 생기지 않도록 확인한다(이 파일에 그 이름이 남지 않게 조각으로 적는다)
    const removed = ['Carousel', 'share' + '-data', 'build' + 'BadgeShareBlob', 'strava' + 'Connected']
    for (const name of removed) expect(share).not.toContain(name)
  })

  it('시트는 compact이고 체크무늬 카드 한 장에 배지 이미지를 70%로 두며 확대·축소 transform을 쓰지 않는다', () => {
    expect(share).toContain('detent="compact"')
    expect(share).toContain('repeating-conic-gradient')
    expect(share).toContain('h-[70%] w-[70%]')
    expect(share).toContain('max-w-[360px]')
    expect(share).not.toContain('scale(')
  })

  it('이미지가 준비됐을 때만 버튼 줄(footer)을 그린다', () => {
    expect(share).toMatch(/effectiveState\.kind === 'ready' \? \(\s*<ShareActionButtons/)
  })
})
