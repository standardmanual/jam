import Link from 'next/link'
import { IconInbox } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'

/** 없는 기획 ID(티켓 20260930_1817, S3). `notFound()`가 이 화면을 보여 준다. */
export default function OpsBundleNotFound() {
  return (
    <div className="p-8">
      <div className="flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border p-8">
        <IconInbox className="size-6 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold">찾을 수 없는 기획이에요</h1>
        <p className="text-sm text-muted-foreground">주소가 잘못됐거나 지워진 기획일 수 있어요.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/ops-inbox">받은 기획함으로</Link>
        </Button>
      </div>
    </div>
  )
}
