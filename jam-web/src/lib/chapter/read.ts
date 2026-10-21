/**
 * 챕터 읽기 (티켓 20261019_1316 2회, 운영 로직 12.1·12.3절)
 *
 * 프로필(5-7)이 쓸 서버 읽기 함수 둘이다. 화면과 API 라우트는 이 티켓이 만들지 않는다.
 * 챕터는 숫자로만 표기한다(2026-10-21 결정, 티켓 20261021_1539). 챕터 이름은 읽지도 돌려주지도 않는다.
 *  - `getMyChapter`: 내 챕터 번호, 다음 챕터까지의 진행 비율. 내 프로필용.
 *  - `getPublicChapter`: 다른 유저에게 보이는 트라이브, 챕터 번호. **진행은 돌려주지 않는다**(12.3절 «다른 유저가 보는 프로필에는 진행은 보여 주지 않는다»).
 *
 * ## 점수의 숫자는 응답에 싣지 않는다 (12.3절)
 * 응답 객체는 아래 필드만 직접 채워 만든다(읽은 행을 펼쳐 담지 않는다). 점수(`total_score`)는 비율을 계산하는 데만 쓰고 버린다. 다른 유저용 읽기는 점수 열을 읽지도 않는다.
 * 응답 키 목록은 `__tests__/read.test.ts`가 고정한다.
 *
 * ## 챕터가 없는 유저와 읽지 못함
 * `user_chapters` 행이 없거나 `chapter_no`가 NULL이면(퀘스트 전) `chapterNo`가 null이다 — 화면이 «챕터 없음»을 그린다. 이때 다음 챕터·비율도 null이다.
 * 조회 오류·예외·계약 밖 값은 **던지지 않고** `console.error`만 남긴 뒤 `{ ok: false }`를 돌려준다. «챕터 없음»(`{ ok: true, chapterNo: null, ... }`)과 구분되며,
 * 어느 한 조회라도 실패하면 일부만 채운 응답을 만들지 않고 전체를 읽지 못함으로 돌려준다. 읽지 못했을 때 무엇을 그릴지는 호출부가 정한다.
 *
 * ## 읽는 곳
 *  - `user_chapters`: 본인 행만 읽는 정책(마이그레이션 221)이라 service 클라이언트를 받는다. 호출부(서버)가 주입한다 — `lib/chapter/`의 다른 함수와 같은 모양이다.
 *  - `chapter_definitions`: 전체를 한 번 읽어 계산한다(`progress.ts`).
 *  - 트라이브는 `users.tribe_id`가 가리키는 **지금** 트라이브다(다른 유저용 읽기만 읽는다). 트라이브가 바뀌어도 챕터 숫자는 그대로다.
 * service 클라이언트는 모든 유저의 행을 읽을 수 있으므로 «누구의 챕터를 보여도 되는가»는 호출부가 정한다(프로필 화면이 이미 갖고 있는 접근 규칙).
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeChapterProgress, type ChapterDefinitionRow } from './progress'

/** 내 프로필용 읽기 결과 */
export type MyChapterResult =
  | {
      ok: true
      /** 지금 챕터. 챕터가 없는 유저(퀘스트 전)는 null */
      chapterNo: number | null
      /** 다음 챕터 번호. 마지막 챕터이거나 챕터가 없으면 null */
      nextChapterNo: number | null
      /** 다음 챕터까지의 비율(0~1, 소수 둘째 자리까지 내림). 마지막 챕터이거나 챕터가 없으면 null */
      progress: number | null
    }
  | { ok: false }

export interface PublicChapterTribe {
  id: string
  name: string
}

/** 다른 유저에게 보이는 읽기 결과 */
export type PublicChapterResult =
  | {
      ok: true
      /** 유저의 지금 트라이브. 트라이브를 고르지 않았으면 null */
      tribe: PublicChapterTribe | null
      /** 지금 챕터. 챕터가 없는 유저(퀘스트 전)는 null */
      chapterNo: number | null
    }
  | { ok: false }

type Fail = { ok: false }
type Read<T> = { ok: true; value: T } | Fail

type UserChapterRead = { chapterNo: null } | { chapterNo: number; totalScore: number | null }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readFailed(what: string, userId: string, detail: string): Fail {
  console.error(`[chapter-read] ${what} 읽기 실패 — userId: ${userId}: ${detail}`)
  return { ok: false }
}

/** 한 조회를 감싼다. 던지면 읽지 못함으로 바꾼다 */
async function guarded<T>(what: string, userId: string, run: () => Promise<Read<T>>): Promise<Read<T>> {
  try {
    return await run()
  } catch (e) {
    return readFailed(what, userId, `예외: ${errorText(e)}`)
  }
}

function isChapterNo(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** `user_chapters`의 한 행. 행이 없거나 `chapter_no`가 NULL이면 챕터가 없다. 점수는 `includeScore`일 때만 읽는다 */
function readUserChapter(supabase: SupabaseClient, userId: string, includeScore: boolean): Promise<Read<UserChapterRead>> {
  return guarded<UserChapterRead>('내 챕터(user_chapters)', userId, async () => {
    const { data, error } = await supabase
      .from('user_chapters')
      .select(includeScore ? 'chapter_no, total_score' : 'chapter_no')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return readFailed('내 챕터(user_chapters)', userId, error.message ?? String(error))
    if (data === null || data === undefined) return { ok: true, value: { chapterNo: null } }
    const row = data as { chapter_no?: unknown; total_score?: unknown }
    if (row.chapter_no === null || row.chapter_no === undefined) return { ok: true, value: { chapterNo: null } }
    if (!isChapterNo(row.chapter_no)) return readFailed('내 챕터(user_chapters)', userId, `해석할 수 없는 chapter_no: ${String(row.chapter_no)}`)
    if (!includeScore) return { ok: true, value: { chapterNo: row.chapter_no, totalScore: null } }
    if (!isScore(row.total_score)) return readFailed('내 챕터(user_chapters)', userId, '해석할 수 없는 total_score')
    return { ok: true, value: { chapterNo: row.chapter_no, totalScore: row.total_score } }
  })
}

/** `chapter_definitions` 전체 */
function readDefinitions(supabase: SupabaseClient, userId: string): Promise<Read<ChapterDefinitionRow[]>> {
  return guarded<ChapterDefinitionRow[]>('챕터 정의(chapter_definitions)', userId, async () => {
    const { data, error } = await supabase.from('chapter_definitions').select('chapter_no, required_score').order('chapter_no', { ascending: true })
    if (error) return readFailed('챕터 정의(chapter_definitions)', userId, error.message ?? String(error))
    if (!Array.isArray(data)) return readFailed('챕터 정의(chapter_definitions)', userId, '목록이 아닌 응답')
    const rows: ChapterDefinitionRow[] = []
    for (const raw of data as Array<{ chapter_no?: unknown; required_score?: unknown }>) {
      if (!isChapterNo(raw?.chapter_no) || !isScore(raw?.required_score)) {
        return readFailed('챕터 정의(chapter_definitions)', userId, '해석할 수 없는 행')
      }
      rows.push({ chapterNo: raw.chapter_no, requiredScore: raw.required_score })
    }
    return { ok: true, value: rows }
  })
}

/** 유저의 지금 트라이브(`users.tribe_id` → `tribes`). 트라이브를 고르지 않았으면 null */
function readTribe(supabase: SupabaseClient, userId: string): Promise<Read<PublicChapterTribe | null>> {
  return guarded<PublicChapterTribe | null>('트라이브(users)', userId, async () => {
    const { data, error } = await supabase.from('users').select('tribe:tribes(id, name)').eq('id', userId).maybeSingle()
    if (error) return readFailed('트라이브(users)', userId, error.message ?? String(error))
    const embedded = (data as { tribe?: unknown } | null)?.tribe
    const raw = Array.isArray(embedded) ? embedded[0] : embedded
    if (raw === null || raw === undefined) return { ok: true, value: null }
    const tribe = raw as { id?: unknown; name?: unknown }
    if (typeof tribe.id !== 'string' || typeof tribe.name !== 'string') {
      return readFailed('트라이브(users)', userId, '해석할 수 없는 트라이브')
    }
    return { ok: true, value: { id: tribe.id, name: tribe.name } }
  })
}

/**
 * 내 챕터와 다음 챕터까지의 진행 비율을 읽는다(내 프로필용). 던지지 않는다 — 읽지 못하면 `{ ok: false }`다.
 * 챕터가 없는 유저는 `chapterNo`·`nextChapterNo`·`progress`가 모두 null이다.
 */
export async function getMyChapter(supabase: SupabaseClient, userId: string): Promise<MyChapterResult> {
  try {
    const chapter = await readUserChapter(supabase, userId, true)
    if (!chapter.ok) return { ok: false }
    if (chapter.value.chapterNo === null) return { ok: true, chapterNo: null, nextChapterNo: null, progress: null }

    const { chapterNo, totalScore } = chapter.value
    if (totalScore === null) return readFailed('내 챕터(user_chapters)', userId, '점수를 읽지 못했다')
    const definitions = await readDefinitions(supabase, userId)
    if (!definitions.ok) return { ok: false }

    const progress = computeChapterProgress(totalScore, chapterNo, definitions.value)
    if (!progress) return readFailed('챕터 정의(chapter_definitions)', userId, `지금 챕터 ${chapterNo}의 정의가 없다`)

    return { ok: true, chapterNo, nextChapterNo: progress.nextChapterNo, progress: progress.progress }
  } catch (e) {
    return readFailed('내 챕터', userId, `예외: ${errorText(e)}`)
  }
}

/**
 * 다른 유저에게 보이는 트라이브와 챕터 번호를 읽는다. 진행(비율 포함)과 점수는 읽지도 돌려주지도 않는다.
 * 던지지 않는다 — 읽지 못하면 `{ ok: false }`다. 챕터가 없는 유저는 `chapterNo`가 null이다(트라이브는 그대로 돌려준다).
 */
export async function getPublicChapter(supabase: SupabaseClient, userId: string): Promise<PublicChapterResult> {
  try {
    const [chapter, tribe] = await Promise.all([readUserChapter(supabase, userId, false), readTribe(supabase, userId)])
    if (!chapter.ok || !tribe.ok) return { ok: false }

    return { ok: true, tribe: tribe.value, chapterNo: chapter.value.chapterNo }
  } catch (e) {
    return readFailed('다른 유저의 챕터', userId, `예외: ${errorText(e)}`)
  }
}
