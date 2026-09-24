/**
 * 드랍 제외 두 표 — 서버 일괄 처리 틀 사용 계약(티켓 20260924_0948 완료 조건)
 *
 * "드랍 제외 두 표에 단건 요청 반복이 없다"를 소스 스캔으로 고정한다 — 리팩터 중 실수로
 * `for...of` + 단건 `fetch`가 되돌아와도 이 테스트가 잡는다(`poi-table-bulk-contract.test.ts`와
 * 같은 방식).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function codeOf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const files = {
  badges: codeOf('src/components/admin/drop-policy/DropExclusionBadgesTable.tsx'),
  collections: codeOf('src/components/admin/drop-policy/DropExclusionCollectionsTable.tsx'),
  controls: codeOf('src/components/admin/drop-policy/DropExclusionBulkControls.tsx'),
}

describe('드랍 제외 표에 단건 반복이 없다', () => {
  it.each(Object.entries(files))('%s: 선택 항목을 한 건씩 반복하는 for-of가 없다', (_name, code) => {
    expect(code).not.toMatch(/for\s*\(\s*const\s+id\s+of/)
  })

  it('일괄 제외·해제는 서버 일괄 처리(runBulk) 한 번으로 보낸다', () => {
    expect(files.controls).toContain("const BULK_ENDPOINT = '/api/admin/drop-policy/exclusions/bulk'")
    expect(files.controls).toMatch(/runBulk\(/)
  })

  it('단건 PATCH는 표 안 스위치(InlineSwitchCell) 한 자리에만 있다', () => {
    for (const code of [files.badges, files.collections]) {
      // 코드의 요청 호출만 센다(주석 속 경로는 제외)
      expect(code.match(/requestJson\(\s*`\/api\/admin\/[a-z]+\/\$\{[^}]+\}\/drop-exclude`/g) ?? []).toHaveLength(1)
      expect(code).toContain('InlineSwitchCell')
    }
  })
})
