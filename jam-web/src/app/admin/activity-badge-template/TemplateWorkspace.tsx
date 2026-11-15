'use client'

/**
 * 템플릿 항목을 들고 «배지 만들기»·«템플릿» 두 탭을 그린다 (티켓 20261116_0555).
 * 템플릿 탭에서 올리거나 지운 결과가 새로 고침 없이 «배지 만들기»에 반영된다.
 */
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import BadgeStudio from './BadgeStudio'
import TemplateManager from './TemplateManager'

export default function TemplateWorkspace({ initial }: { initial: TemplateItem[] }) {
  const [items, setItems] = useState<TemplateItem[]>(initial)
  const [tab, setTab] = useState('studio')
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="studio">배지 만들기</TabsTrigger>
        <TabsTrigger value="templates">템플릿</TabsTrigger>
      </TabsList>
      {/* 두 탭을 모두 붙여 둔다. 떼면 템플릿을 올리고 돌아왔을 때 검색과 고른 배지가 사라진다. */}
      <TabsContent value="studio" forceMount className="data-[state=inactive]:hidden">
        <BadgeStudio templates={items} onGoToTemplates={() => setTab('templates')} />
      </TabsContent>
      <TabsContent value="templates" forceMount className="data-[state=inactive]:hidden">
        <TemplateManager items={items} onItemsChange={setItems} />
      </TabsContent>
    </Tabs>
  )
}
