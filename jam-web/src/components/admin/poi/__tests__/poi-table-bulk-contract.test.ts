/**
 * PoiTable — 서버 일괄 처리 틀 사용 계약(티켓 20260924_0941 완료 조건)
 *
 * `rg -n "for \(const id of" jam-web/src/components/admin/poi`가 0건이어야 한다는 완료
 * 조건을 소스 스캔으로 고정한다 — 단건 반복이 조용히 되돌아와도(예: 리팩터 중 실수로
 * `for...of` + 단건 `fetch`를 다시 추가) 이 테스트가 잡는다. `route-contract.test.ts`와
 * 같은 방식이다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function codeOf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const code = codeOf('src/components/admin/poi/PoiTable.tsx')

describe('PoiTable에 단건 반복이 없다', () => {
  it('선택 항목을 한 건씩 반복하는 for (const id of ...) 패턴이 없다', () => {
    expect(code).not.toMatch(/for\s*\(\s*const\s+id\s+of/)
  })

  it('공용 서버 일괄 처리 호출(runBulk)을 쓴다', () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\brunBulk\b[^}]*\}\s*from\s*'@\/components\/admin\/data-table\/admin-fetch'/
    )
    expect(code).toMatch(/runBulk\(/)
  })

  it('활성화·비활성화·카테고리 변경·삭제 모두 /api/admin/poi/bulk 한 엔드포인트로 보낸다', () => {
    expect(code).toContain("const BULK_ENDPOINT = '/api/admin/poi/bulk'")
    // 단건 PATCH(/api/admin/poi/${id})는 표 안 즉시 토글(InlineSwitchCell) 한 자리에만 남아야 한다
    const singlePatchCalls = code.match(/fetch\(`\/api\/admin\/poi\/\$\{[^}]+\}`/g) ?? []
    expect(singlePatchCalls).toHaveLength(1)
  })
})
