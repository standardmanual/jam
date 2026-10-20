/**
 * 챕터 이름 조회 (티켓 20261019_1316 2회, 운영 로직 12.1·12.3절)
 *
 * `chapter_names`(마이그레이션 221)에서 (트라이브 id, 챕터 번호)로 이름을 읽는다. 이름 표는 처음에 0행이고 `name` 열도 비어도 되므로(이름 50개와 어드민 입력은 별도 주제)
 * 이름이 없는 상태가 정상이다 — 행이 없거나 `name`이 null·빈 문자열·공백뿐이면 `null`이다(사용자 결정 3: 서버는 null을 돌려주고 화면은 «챕터 N»만 보인다).
 * 값이 있으면 저장된 그대로 돌려준다(앞뒤 공백도 고치지 않는다).
 *
 * 트라이브가 바뀌면 챕터 숫자는 그대로이고 이름만 새 트라이브의 것으로 바뀐다 — 호출부는 유저의 **지금** 트라이브 id를 넘긴다(`read.ts`가 그렇게 한다).
 *
 * **던지지 않는다.** 조회 오류·예외는 `console.error`만 남기고 `{ ok: false }`다 — «이름이 없음»(`{ ok: true, name: null }`)과 구분된다.
 *
 * 서버 전용이다(`chapter_names`는 로그인 유저가 읽을 수 있지만 호출부가 service 클라이언트를 주입하는 모양을 `lib/chapter/`의 다른 함수와 맞춘다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ChapterNameResult = { ok: true; name: string | null } | { ok: false }

/** 이름 표의 값을 화면에 쓸 이름으로 바꾼다. 문자열이 아니거나 비어 있거나 공백뿐이면 null, 아니면 저장된 그대로다 */
export function normalizeChapterName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return raw.trim() === '' ? null : raw
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** (트라이브 id, 챕터 번호)의 챕터 이름을 읽는다. 이름이 없으면 `name`이 null이고, 읽지 못하면 `{ ok: false }`다 */
export async function getChapterName(supabase: SupabaseClient, tribeId: string, chapterNo: number): Promise<ChapterNameResult> {
  // 트라이브가 없거나 챕터 번호가 잘못된 호출은 읽을 행이 없다(이름 없음). 표를 읽지 않는다
  if (!tribeId || !Number.isInteger(chapterNo) || chapterNo < 1) return { ok: true, name: null }
  try {
    const { data, error } = await supabase
      .from('chapter_names')
      .select('name')
      .eq('tribe_id', tribeId)
      .eq('chapter_no', chapterNo)
      .maybeSingle()
    if (error) {
      console.error(
        `[chapter-read] 챕터 이름 읽기 실패 — tribeId: ${tribeId}, chapterNo: ${chapterNo}: ${error.message ?? String(error)}`
      )
      return { ok: false }
    }
    return { ok: true, name: normalizeChapterName((data as { name?: unknown } | null)?.name) }
  } catch (e) {
    console.error(`[chapter-read] 챕터 이름 읽기 예외 — tribeId: ${tribeId}, chapterNo: ${chapterNo}: ${errorText(e)}`)
    return { ok: false }
  }
}
