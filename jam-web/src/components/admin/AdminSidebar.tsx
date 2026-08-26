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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/admin/ui/sidebar'
import { DASHBOARD_ITEM, NAV_GROUPS, activeNavGroupId, isNavItemActive } from './adminNavItems'

/**
 * AdminSidebar
 *
 * 어드민 영역의 좌측 네비게이션 — shadcn 공식 `Sidebar` 컴포넌트(`collapsible="icon"`) 기반.
 * - 데스크탑: 접기/펼치기 상태는 `SidebarProvider`(admin/layout.tsx)가 관리. 접힘 상태에서는
 *   `SidebarGroupLabel`이 자동으로 사라지고 아이콘만 남는다(shadcn 기본 동작 — 커스텀 불필요).
 * - 모바일: `Sidebar`가 내부적으로 `useIsMobile()`을 감지해 Sheet 드로어로 자동 전환된다.
 * - 대시보드는 그룹 밖에 고정, 나머지 항목은 adminNavItems.ts의 NAV_GROUPS 그룹핑을 그대로
 *   `SidebarGroup`으로 매핑한다(라벨·href·아이콘은 손대지 않음).
 * - 터치 타겟 ≥ 44px 유지를 위해 `SidebarMenuButton size="lg"` 사용.
 * - 그룹별 접고/펼치기는 shadcn 공식 `Accordion`으로 구현하되, 데스크탑 아이콘-collapse
 *   모드(`state === 'collapsed'`)일 때는 Accordion을 아예 렌더링하지 않고 모든 그룹을
 *   항상 펼친 상태로 그린다 — Radix `AccordionContent`는 닫힘 시 DOM에서 완전히 제거되는데,
 *   이 상태로 아이콘 모드에 들어가면 닫혀 있던 그룹의 아이콘까지 통째로 사라지는 조합 버그가
 *   생기기 때문(20260826_013 게이트 리뷰 후속 대응). 이 분기 자체가 그 버그를 원천 차단한다.
 */
export function AdminSidebar() {
  const pathname = usePathname()
  const { state, isMobile } = useSidebar()
  const isIconMode = !isMobile && state === 'collapsed'
  const defaultOpenGroup = activeNavGroupId(pathname)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-xl font-black tracking-tighter text-sidebar-foreground">
            JAM!
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
            Admin
          </span>
        </div>
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
                  <Link href={DASHBOARD_ITEM.href}>
                    <span className="text-lg">{DASHBOARD_ITEM.icon}</span>
                    <span>{DASHBOARD_ITEM.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isIconMode ? (
          // 아이콘-collapse 모드: Accordion을 아예 쓰지 않고 모든 그룹을 항상 펼쳐 그린다.
          // (그룹 라벨은 SidebarGroupLabel의 기본 동작으로 자동 숨김 — 아이콘만 남음)
          NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        size="lg"
                        isActive={isNavItemActive(pathname, item)}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <span className="text-lg">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        ) : (
          // 펼친 모드(데스크탑 확장 + 모바일 드로어): 그룹별 독립 접기/펼치기(Accordion, 다중 선택).
          // 현재 경로가 속한 그룹을 기본으로 연다(기존 동작과 동일).
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
                          isActive={isNavItemActive(pathname, item)}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <span className="text-lg">{item.icon}</span>
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
        )}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
