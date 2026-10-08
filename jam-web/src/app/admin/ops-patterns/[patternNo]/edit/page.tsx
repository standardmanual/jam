import { notFound } from 'next/navigation'
import { OpsPatternForm } from '@/components/admin/ops/OpsPatternForm'
import { OpsPatternDetailHeader, PatternBackLink } from '@/components/admin/ops/OpsPatternDetail'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { logQueryError } from '@/lib/admin/queryError'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { draftFromRecord } from '@/lib/admin/opsPatterns/formDraft'
import { getOpsPattern, type OpsPatternRecord } from '@/lib/admin/opsPatterns/read'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 패턴 고치기 (`/admin/ops-patterns/[patternNo]/edit`, 티켓 20261008_1617 ⑩a-2, 상위 20260930_1503 「채원 S5·S6 사전 판정」 ⑩a, 운영툴 PRD §6 S5).
 *
 * 번호 형식이 `P01`~이 아니거나 사전에 없으면 404다. 보관 패턴도 고칠 수 있다. 읽기가 **실패**하면 404가 아니라 안내 카드다.
 * 폼에는 `key={updatedAt}`를 줘서, 409 뒤 `router.refresh()`로 새 값이 오면 폼이 새 값으로 처음부터 시작한다.
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다).
 */

const PATTERN_LOAD_FAILED_TITLE = '패턴을 불러오지 못했어요'

type Loaded = { ok: true; pattern: OpsPatternRecord | null } | { ok: false }

async function load(patternNo: string): Promise<Loaded> {
  try {
    return { ok: true, pattern: await getOpsPattern(createServiceClient(), patternNo) }
  } catch (error) {
    logQueryError({ message: error instanceof Error ? error.message : String(error) }, 'ops-patterns/edit/pattern')
    return { ok: false }
  }
}

export default async function OpsPatternEditPage({ params }: { params: Promise<{ patternNo: string }> }) {
  const { patternNo } = await params
  if (!OPS_PATTERN_NO_PATTERN.test(patternNo)) notFound()

  const loaded = await load(patternNo)
  if (loaded.ok && loaded.pattern === null) notFound()

  if (!loaded.ok || loaded.pattern === null) {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-6xl space-y-4">
          <PatternBackLink />
          <OpsSectionNotice icon="patterns" title={PATTERN_LOAD_FAILED_TITLE} />
        </div>
      </div>
    )
  }

  const record = loaded.pattern
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-6xl">
        <OpsPatternForm
          key={record.updatedAt}
          mode="edit"
          patternNo={record.patternNo}
          updatedAt={record.updatedAt}
          initial={draftFromRecord(record)}
          header={<OpsPatternDetailHeader pattern={record} />}
        />
      </div>
    </div>
  )
}
