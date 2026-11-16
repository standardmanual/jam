import { listTemplateItems } from '@/lib/admin/activityBadgeTemplate/templateItem'
import BadgeStudio from './BadgeStudio'

export default function AdminActivityBadgeTemplatePage() {
  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">액티비티 배지 템플릿</h1>
        <p className="text-muted-foreground text-sm mt-1 break-keep wrap-break-word text-balance">
          배지를 고르면 그 배지가 속한 분류의 템플릿에 이름과 값이 자동으로 들어가요
        </p>
      </div>
      <BadgeStudio templates={listTemplateItems()} />
    </div>
  )
}
