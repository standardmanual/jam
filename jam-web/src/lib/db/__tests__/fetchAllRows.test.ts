/**
 * 페이징 조회 도우미를 순수 파일로 옮긴 경계 (티켓 20261002_2306 가정 1).
 *
 * 동작 자체(페이지 경계·정렬·청크 분할·오류 문장)는 `notifications/__tests__/batch-query.test.ts`가 `batch/shared`의 다시 내보내기로 이미 잠근다.
 * 여기서는 옮긴 결과만 본다: 같은 함수를 가리키는지, 새 파일이 서버 전용 모듈을 값으로 가져오지 않는지, 예약 대상 읽기가 새 파일을 쓰는지.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import * as shared from '@/lib/notifications/batch/shared'
import * as pure from '../fetchAllRows'

/** `import type`이 아닌 값 import의 경로 목록. */
function valueImportsOf(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8')
  return [...source.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1])
}

describe('batch/shared 다시 내보내기', () => {
  it('기존 호출부가 쓰는 이름이 새 파일의 같은 값이다', () => {
    expect(shared.fetchAllRows).toBe(pure.fetchAllRows)
    expect(shared.fetchAllRowsIn).toBe(pure.fetchAllRowsIn)
    expect(shared.PAGE_SIZE).toBe(pure.PAGE_SIZE)
    expect(shared.IN_CHUNK_SIZE).toBe(pure.IN_CHUNK_SIZE)
  })

  it('상수는 옮기기 전 값 그대로다', () => {
    expect(pure.PAGE_SIZE).toBe(1000)
    expect(pure.IN_CHUNK_SIZE).toBe(200)
  })
})

describe('순수 파일 계약', () => {
  it('새 파일은 값 import가 없다', () => {
    expect(valueImportsOf(path.join(__dirname, '..', 'fetchAllRows.ts'))).toEqual([])
  })

  it('예약 대상 읽기(scheduleTargets)는 서버 전용 모듈을 거치는 batch/shared가 아니라 새 파일에서 가져온다', () => {
    const specifiers = valueImportsOf(path.join(__dirname, '..', '..', 'ambient-drop', 'scheduleTargets.ts'))
    expect(specifiers).toContain('@/lib/db/fetchAllRows')
    expect(specifiers).not.toContain('@/lib/notifications/batch/shared')
    for (const specifier of specifiers) {
      expect(specifier.startsWith('@/lib/supabase/'), specifier).toBe(false)
    }
  })

  it('예약 저장소(scheduleStore)의 값 import도 서버 전용 모듈로 이어지지 않는다', () => {
    const specifiers = valueImportsOf(path.join(__dirname, '..', '..', 'ambient-drop', 'scheduleStore.ts'))
    expect(specifiers).not.toContain('@/lib/notifications/batch/shared')
    for (const specifier of specifiers) {
      expect(specifier.startsWith('@/lib/supabase/'), specifier).toBe(false)
    }
  })
})
