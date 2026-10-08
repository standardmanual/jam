import { OpsPatternForm } from '@/components/admin/ops/OpsPatternForm'
import { PatternBackLink } from '@/components/admin/ops/OpsPatternDetail'
import { emptyDraft } from '@/lib/admin/opsPatterns/formDraft'

/**
 * 패턴 만들기 (`/admin/ops-patterns/new`, 티켓 20261008_1617 ⑩a-2, 상위 20260930_1503 「채원 S5·S6 사전 판정」 ⑩a, 운영툴 PRD §6 S5).
 *
 * 빈 폼이다. 저장하면 `POST /api/admin/ops-patterns`(⑩a-1)로 가고, 번호(P19~)·상태(사용 중)·출처(직접 만듦)는 서버가 정한다.
 * `new`는 정적 경로라 `[patternNo]`보다 먼저 잡힌다.
 */

const PAGE_TITLE = '새 패턴 만들기'

export default function OpsPatternNewPage() {
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl">
        <OpsPatternForm
          mode="create"
          initial={emptyDraft()}
          header={
            <header className="space-y-2">
              <PatternBackLink />
              <h1 className="text-2xl font-bold">{PAGE_TITLE}</h1>
            </header>
          }
        />
      </div>
    </div>
  )
}
