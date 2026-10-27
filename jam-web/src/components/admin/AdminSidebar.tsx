'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/admin/ui/accordion'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/admin/ui/sidebar'
import { DASHBOARD_ITEM, NAV_GROUPS, activeNavGroupId, isNavItemActive, mostSpecificActiveItem } from './adminNavItems'

/**
 * AdminSidebar
 *
 * 어드민 영역의 좌측 네비게이션 — shadcn 공식 `Sidebar` 컴포넌트(`collapsible="offcanvas"`, sidebar-01 표준) 기반.
 * - 데스크탑: 접기 시 미니 아이콘으로 축소되지 않고 화면 좌측 밖으로 완전히 숨겨져(`offcanvas`) 본문이 100% 화면을 채운다.
 *   접힌 상태에서는 상단 헤더의 SidebarTrigger 버튼, 화면 최좌측 가장자리(SidebarRail), 단축키(Cmd+B)로 언제든 다시 열 수 있다.
 * - 모바일: `Sidebar`가 내부적으로 `useIsMobile()`을 감지해 Sheet 드로어로 자동 전환된다.
 * - 대시보드는 그룹 밖에 고정, 나머지 항목은 adminNavItems.ts의 NAV_GROUPS 그룹핑을 그대로 `SidebarGroup`으로 매핑한다.
 * - 터치 타겟 ≥ 44px 유지를 위해 `SidebarMenuButton size="lg"` 사용.
 * - 그룹별 접고/펼치기는 shadcn 공식 `Accordion`(다중 선택)으로 동작한다.
 */
export function AdminSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const defaultOpenGroup = activeNavGroupId(pathname)
  // 겹치는 href(예: /admin/item-badges vs /admin/item-badges/orphaned)에서 항목 하나만
  // 활성으로 표시하기 위해 한 번만 계산 — adminNavItems.ts의 mostSpecificActiveItem 참고.
  const activeItem = mostSpecificActiveItem(pathname)
  // 모바일에서 메뉴 항목을 눌러 페이지를 이동하면 드로어(Sheet)를 닫는다. 닫지 않으면
  // Sheet가 열린 채로 남아 이동한 페이지를 가리고, Radix Dialog의 스크롤 잠금
  // (`document.body.style.pointerEvents = 'none'`)도 풀리지 않아 이후 토글 버튼까지
  // 먹통이 된다(20260917_1833 — 실측 재현으로 확인). 데스크탑에서는 아무 영향 없음.
  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link
          href="/admin"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors hover:bg-sidebar-accent"
        >
          <span className="text-xl font-black tracking-tighter text-sidebar-foreground">
            JAM!
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/60">
            Admin
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="lg"
                  isActive={isNavItemActive(pathname, DASHBOARD_ITEM)}
                  tooltip={DASHBOARD_ITEM.label}
                >
                  <Link href={DASHBOARD_ITEM.href} onClick={handleNavClick}>
                    <DASHBOARD_ITEM.icon />
                    <span>{DASHBOARD_ITEM.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Accordion
          type="multiple"
          defaultValue={defaultOpenGroup ? [defaultOpenGroup] : []}
        >
          {NAV_GROUPS.map((group) => (
            <AccordionItem key={group.id} value={group.id} className="border-b-0 p-2">
              <AccordionTrigger className="h-8 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-foreground hover:no-underline focus-visible:ring-2 [&>svg]:size-3.5">
                {group.label}
              </AccordionTrigger>
              <AccordionContent className="pb-0 pt-1">
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        size="lg"
                        isActive={activeItem?.href === item.href}
                        tooltip={item.label}
                      >
                        <Link href={item.href} onClick={handleNavClick}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
