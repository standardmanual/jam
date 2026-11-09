/**
 * 어드민 포털 콘텐츠의 테마 스코프 (티켓 20261015_2313)
 *
 * `container` 없이 body 아래에 그려지는 포털은 `[data-admin-theme]` 밖이라 서비스 토큰
 * (--border·--foreground·--muted)을 받는다. 포털 콘텐츠 노드에 `data-admin-theme`를 직접 걸어
 * 어드민 값을 되찾는지 고정한다. 저장소에 jsdom이 없어 Radix Portal을 통과시키고 서버 렌더로 본다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

type Radix = Record<string, unknown>
const { passPortal } = vi.hoisted(() => ({
  passPortal: async (orig: () => Promise<Radix>): Promise<Radix> => ({
    ...(await orig()),
    Portal: ({ children }: { children?: unknown }) => children,
  }),
}))

vi.mock('@radix-ui/react-alert-dialog', async (orig) => passPortal(orig as () => Promise<Radix>))
vi.mock('@radix-ui/react-dialog', async (orig) => passPortal(orig as () => Promise<Radix>))
vi.mock('@radix-ui/react-popover', async (orig) => passPortal(orig as () => Promise<Radix>))
vi.mock('@radix-ui/react-dropdown-menu', async (orig) => passPortal(orig as () => Promise<Radix>))

import { AlertDialog, AlertDialogContent } from '../alert-dialog'
import { Dialog, DialogContent } from '../dialog'
import { Sheet, SheetContent } from '../sheet'
import { Popover, PopoverContent } from '../popover'
import { DropdownMenu, DropdownMenuContent } from '../dropdown-menu'

const SCOPE = /data-admin-theme=""/

describe('어드민 포털 콘텐츠는 container 없이도 어드민 테마 스코프를 가진다', () => {
  it('AlertDialogContent', () => {
    const out = renderToStaticMarkup(
      <AlertDialog open>
        <AlertDialogContent>x</AlertDialogContent>
      </AlertDialog>
    )
    expect(out).toMatch(SCOPE)
  })

  it('DialogContent', () => {
    const out = renderToStaticMarkup(
      <Dialog open>
        <DialogContent>x</DialogContent>
      </Dialog>
    )
    expect(out).toMatch(SCOPE)
  })

  it('SheetContent', () => {
    const out = renderToStaticMarkup(
      <Sheet open>
        <SheetContent>x</SheetContent>
      </Sheet>
    )
    expect(out).toMatch(SCOPE)
  })

  it('PopoverContent', () => {
    const out = renderToStaticMarkup(
      <Popover open>
        <PopoverContent>x</PopoverContent>
      </Popover>
    )
    expect(out).toMatch(SCOPE)
  })

  it('DropdownMenuContent', () => {
    const out = renderToStaticMarkup(
      <DropdownMenu open>
        <DropdownMenuContent>x</DropdownMenuContent>
      </DropdownMenu>
    )
    expect(out).toMatch(SCOPE)
  })
})
