'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from '@/components/admin/ui/sidebar'
import { DASHBOARD_ITEM, NAV_GROUPS, isNavItemActive } from './adminNavItems'

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
 */
export function AdminSidebar() {
  const pathname = usePathname()

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

        {NAV_GROUPS.map((group) => (
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
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
