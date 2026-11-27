/**
 * 챕터 읽기 (티켓 20261019_1316 2회, 운영 로직 12.1·12.3절, 티켓 20261127_1734 게이지 읽기 모델)
 *
 * 프로필·홈이 쓸 서버 읽기 함수다. 화면과 API 라우트는 이 파일이 만들지 않는다.
 * 챕터는 숫자로만 표기한다(2026-10-21 결정, 티켓 20261021_1539). 챕터 이름은 읽지도 돌려주지도 않는다.
 *  - `getMyChapter`: 내 챕터 번호, 이번 챕터에서 모은 잼, 필요 잼, 다음 챕터 번호, 마지막 챕터 여부, 진행 비율, 트라이브 이름. 내 화면용.
 *  - `getPublicChapter`: 다른 유저에게 보이는 트라이브, 챕터 번호. **진행은 돌려주지 않는다**(12.3절 «다른 유저가 보는 프로필에는 진행은 보여 주지 않는다»).
 *
 * ## 진행 기준은 잼이다
 * 진행은 `user_chapters.chapter_jam`(이번 챕터에서 모은 잼)과 `chapter_definitions.required_jam`(챕터를 마치는 데 필요한 잼)으로 계산한다(`progress.ts`).
 * 점수 열(`total_score`, `required_score`)은 읽지 않는다. 다른 유저용 읽기는 `chapter_no`만 읽고 잼 열도 읽지 않는다.
 * 응답 객체는 아래 필드만 직접 채워 만든다(읽은 행을 펼쳐 담지 않는다). 응답 키 목록은 `__tests__/read.test.ts`가 고정한다.
 *
 * ## 챕터가 없는 유저와 읽지 못함
 * `user_chapters` 행이 없거나 `chapter_no`가 NULL이면(퀘스트 전) `chapterNo`·`chapterJam`·`requiredJam`·`nextChapterNo`·`progress`·`tribeName`이 모두 null이고
 * `isLastChapter`는 false다 — 화면이 «챕터 없음»을 그린다.
 * 조회 오류·예외·계약 밖 값은 **던지지 않고** `console.error`만 남긴 뒤 `{ ok: false }`를 돌려준다. «챕터 없음»과 구분되며,
 * 챕터·정의 조회 중 하나라도 실패하면 일부만 채운 응답을 만들지 않고 전체를 읽지 못함으로 돌려준다(트라이브만 예외: 읽지 못하면 `tribeName: null`).
 * 마지막 챕터는 사실값만 돌려준다(`requiredJam: null`, `isLastChapter: true`, `progress: null`, `chapterJam`은 쌓인 값). 화면 표현은 호출부가 정한다.
 *
 * ## 읽는 곳
 *  - `user_chapters`: 본인 행만 읽는 정책(마이그레이션 221)이라 service 클라이언트를 받는다. 호출부(서버)가 주입한다 — `lib/chapter/`의 다른 함수와 같은 모양이다.
 *  - `chapter_definitions`: 전체를 한 번 읽어 계산한다(`progress.ts`).
 *  - 트라이브는 `users.tribe_id`가 가리키는 **지금** 트라이브다. 트라이브가 바뀌어도 챕터 숫자는 그대로다.
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
      /** 이번 챕터에서 모은 잼(0 이상의 정수). 챕터가 없으면 null */
      chapterJam: number | null
      /** 지금 챕터를 마치는 데 필요한 잼. 마지막 챕터이거나 챕터가 없으면 null */
      requiredJam: number | null
      /** 다음 챕터 번호. 마지막 챕터이거나 챕터가 없으면 null */
      nextChapterNo: number | null
      /** 더 오를 수 없는 챕터인가. 챕터가 없으면 false */
      isLastChapter: boolean
      /** 이번 챕터 진행(0~1, 소수 둘째 자리까지 내림). 마지막 챕터이거나 챕터가 없으면 null */
      progress: number | null
      /** 지금 소속 트라이브 이름. 소속이 없거나 읽지 못하거나 챕터가 없으면 null */
      tribeName: string | null
    }
  | { ok: false }

interface PublicChapterTribe {
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

type UserChapterRead = { chapterNo: null } | { chapterNo: number; chapterJam: number | null }

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

function isJam(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isRequiredJam(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

/** `user_chapters`의 한 행. 행이 없거나 `chapter_no`가 NULL이면 챕터가 없다. 이번 챕터 잼은 `includeJam`일 때만 읽는다 */
function readUserChapter(supabase: SupabaseClient, userId: string, includeJam: boolean): Promise<Read<UserChapterRead>> {
  return guarded<UserChapterRead>('내 챕터(user_chapters)', userId, async () => {
    const { data, error } = await supabase
      .from('user_chapters')
      .select(includeJam ? 'chapter_no, chapter_jam' : 'chapter_no')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return readFailed('내 챕터(user_chapters)', userId, error.message ?? String(error))
    if (data === null || data === undefined) return { ok: true, value: { chapterNo: null } }
    const row = data as { chapter_no?: unknown; chapter_jam?: unknown }
    if (row.chapter_no === null || row.chapter_no === undefined) return { ok: true, value: { chapterNo: null } }
    if (!isChapterNo(row.chapter_no)) return readFailed('내 챕터(user_chapters)', userId, `해석할 수 없는 chapter_no: ${String(row.chapter_no)}`)
    if (!includeJam) return { ok: true, value: { chapterNo: row.chapter_no, chapterJam: null } }
    if (!isJam(row.chapter_jam)) return readFailed('내 챕터(user_chapters)', userId, '해석할 수 없는 chapter_jam')
    return { ok: true, value: { chapterNo: row.chapter_no, chapterJam: row.chapter_jam } }
  })
}

/** `chapter_definitions` 전체. `required_jam`은 NULL(마지막 챕터) 또는 1 이상의 정수여야 한다 */
function readDefinitions(supabase: SupabaseClient, userId: string): Promise<Read<ChapterDefinitionRow[]>> {
  return guarded<ChapterDefinitionRow[]>('챕터 정의(chapter_definitions)', userId, async () => {
    const { data, error } = await supabase.from('chapter_definitions').select('chapter_no, required_jam').order('chapter_no', { ascending: true })
    if (error) return readFailed('챕터 정의(chapter_definitions)', userId, error.message ?? String(error))
    if (!Array.isArray(data)) return readFailed('챕터 정의(chapter_definitions)', userId, '목록이 아닌 응답')
    const rows: ChapterDefinitionRow[] = []
    for (const raw of data as Array<{ chapter_no?: unknown; required_jam?: unknown }>) {
      const requiredJam = raw?.required_jam
      if (!isChapterNo(raw?.chapter_no) || !(requiredJam === null || isRequiredJam(requiredJam))) {
        return readFailed('챕터 정의(chapter_definitions)', userId, '해석할 수 없는 행')
      }
      rows.push({ chapterNo: raw.chapter_no, requiredJam })
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
 * 내 챕터와 이번 챕터 진행을 읽는다. 던지지 않는다 — 읽지 못하면 `{ ok: false }`다.
 * 챕터가 없는 유저는 값이 모두 null이고 `isLastChapter`는 false다. 트라이브를 읽지 못해도 `tribeName: null`로 `ok: true`다.
 */
export async function getMyChapter(supabase: SupabaseClient, userId: string): Promise<MyChapterResult> {
  try {
    const [chapter, definitions, tribe] = await Promise.all([
      readUserChapter(supabase, userId, true),
      readDefinitions(supabase, userId),
      readTribe(supabase, userId),
    ])
    if (!chapter.ok) return { ok: false }
    if (chapter.value.chapterNo === null) {
      return { ok: true, chapterNo: null, chapterJam: null, requiredJam: null, nextChapterNo: null, isLastChapter: false, progress: null, tribeName: null }
    }
    if (!definitions.ok) return { ok: false }

    const { chapterNo, chapterJam } = chapter.value
    if (chapterJam === null) return readFailed('내 챕터(user_chapters)', userId, '이번 챕터 잼을 읽지 못했다')

    const computed = computeChapterProgress(chapterJam, chapterNo, definitions.value)
    if (!computed) return readFailed('챕터 정의(chapter_definitions)', userId, `지금 챕터 ${chapterNo}의 정의가 없다`)

    return {
      ok: true,
      chapterNo,
      chapterJam,
      requiredJam: computed.requiredJam,
      nextChapterNo: computed.nextChapterNo,
      isLastChapter: computed.isLastChapter,
      progress: computed.progress,
      tribeName: tribe.ok ? tribe.value?.name ?? null : null,
    }
  } catch (e) {
    return readFailed('내 챕터', userId, `예외: ${errorText(e)}`)
  }
}

/**
 * 내 프로필 챕터 줄 앞에 붙는 내 트라이브 이름을 읽는다(2026-11-09 사용자 지시). 트라이브를 고르지 않았거나 읽지 못하면 null이다.
 * 던지지 않는다 — 읽지 못해도 챕터 줄은 트라이브 없이 그려진다(읽기 실패는 `readTribe`가 `console.error`로 남긴다).
 * 프로필 화면이 아직 이 함수를 쓴다(카드 전환 때 걷는다).
 */
export async function getMyTribeName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const tribe = await readTribe(supabase, userId)
    return tribe.ok ? tribe.value?.name ?? null : null
  } catch (e) {
    console.error(`[chapter-read] 내 트라이브 읽기 실패 — userId: ${userId}: 예외: ${errorText(e)}`)
    return null
  }
}

/**
 * 다른 유저에게 보이는 트라이브와 챕터 번호를 읽는다. 진행(잼·필요 잼·비율 포함)과 점수는 읽지도 돌려주지도 않는다.
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
