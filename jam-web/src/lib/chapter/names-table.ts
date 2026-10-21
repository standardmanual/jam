/**
 * 챕터 이름 표의 읽기·저장 (티켓 20261019_1318 2회, 운영 로직 12.2·12.5절)
 *
 * 어드민이 «트라이브 × 챕터 1~N» 표 한 화면에서 `chapter_names`(마이그레이션 221)를 채운다. 읽는 쪽(`name.ts`의 `normalizeChapterName`)은
 * 행이 없는 것과 `name`이 비어 있는 것을 같게 보므로, 저장은 **빈 칸이면 행을 지운다**(이름 없음 = 행 없음).
 *
 * ## 표의 모양
 *  - 행은 `tribes` 전부다(비활성 포함, `sort_order` 순). 활성 여부는 화면이 표기한다 — 이름 50개는 트라이브 5개 기준이지만 DB에는 10개가 있다.
 *  - 열은 `chapter_definitions`의 챕터 번호 전부다(지금 10개, 어드민이 챕터를 더하면 열도 늘어난다).
 *
 * ## 저장 규칙
 *  - 요청은 **바뀐 칸만** 보낸다(전체 표를 보내면 다른 운영자가 방금 고친 칸을 낡은 값으로 덮는다). 칸마다 `{ tribe_id, chapter_no, name }`이고 `name`이 빈 값이면 지운다.
 *  - 이름은 앞뒤 공백을 지운 뒤 {@link CHAPTER_NAME_MAX_LENGTH}자 이하여야 한다. 상한은 정해진 정책이 없어 프로필 줄에 들어가는 길이를 보수적으로 잡았다.
 *  - 같은 칸이 한 요청에 두 번 오면 거절한다(upsert가 같은 행을 두 번 바꿀 수 없다).
 *  - 없는 트라이브·없는 챕터는 DB 외래 키 오류(500)가 되기 전에 400으로 알린다.
 *  - PostgREST는 여러 문장을 한 트랜잭션으로 묶지 못한다 — 이름을 넣은 뒤 지우는 순서이고, 지우기가 실패하면 일부만 저장된 것이다({@link ChapterNamesSaveError}의 `partial`).
 *
 * 순수 함수(`cellKey`, `diffChapterNameCells`, `parseChapterNameChanges`)는 화면(클라이언트)도 쓴다 — 서버 전용 코드를 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/admin/uuid'
import { throwOnQueryError } from '@/lib/admin/queryError'
import { normalizeChapterName } from './name'

/** 챕터 이름의 최대 길이(앞뒤 공백을 지운 뒤, 글자 수 기준) */
export const CHAPTER_NAME_MAX_LENGTH = 20

export const CHAPTER_NAMES_READ_ERROR_MESSAGE = '챕터 이름 표를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const CHAPTER_NAMES_SAVE_ERROR_MESSAGE = '챕터 이름이 저장되지 않았어요. 데이터베이스가 요청을 처리하지 못했어요. 잠시 뒤 다시 저장해 주세요.'
export const CHAPTER_NAMES_PARTIAL_ERROR_MESSAGE =
  '챕터 이름 일부만 저장됐을 수 있어요. 화면을 새로 고쳐 저장된 이름을 확인한 뒤 다시 저장해 주세요.'
export const CHAPTER_NAMES_BODY_INVALID_MESSAGE = '저장할 이름을 읽지 못했어요. 화면을 새로 고친 뒤 다시 저장해 주세요.'
export const CHAPTER_NAMES_TOO_LONG_MESSAGE = `챕터 이름이 너무 길어요. ${CHAPTER_NAME_MAX_LENGTH}자 이하로 줄여 주세요.`
export const CHAPTER_NAMES_DUPLICATE_MESSAGE = '같은 칸이 두 번 들어 있어요. 화면을 새로 고친 뒤 다시 저장해 주세요.'
export const CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE =
  '없어졌거나 알 수 없는 트라이브나 챕터가 들어 있어요. 화면을 새로 고친 뒤 다시 저장해 주세요.'

export interface ChapterNamesTribe {
  id: string
  name: string
  isActive: boolean
}

/** 이름이 있는 칸 하나 */
export interface ChapterNameCell {
  tribeId: string
  chapterNo: number
  name: string
}

export interface ChapterNamesTableData {
  /** `sort_order` 순, 비활성 포함 */
  tribes: ChapterNamesTribe[]
  /** `chapter_definitions`의 챕터 번호, 오름차순 */
  chapterNos: number[]
  /** 이름이 있는 칸만. 이름이 없거나 공백뿐인 행은 담지 않는다 */
  cells: ChapterNameCell[]
}

/** 저장할 칸 하나. `name`이 빈 문자열이면 그 칸의 행을 지운다 */
export interface ChapterNameChange {
  tribeId: string
  chapterNo: number
  name: string
}

export function cellKey(tribeId: string, chapterNo: number): string {
  return `${tribeId}:${chapterNo}`
}

/** 글자 수(UTF-16 조각이 아니라 문자 단위) */
function charLength(text: string): number {
  return Array.from(text).length
}

/**
 * 화면용: 불러온 값(`baseline`)과 지금 입력(`current`)을 비교해 바뀐 칸만 돌려준다.
 * 앞뒤 공백을 지운 값이 같으면 바뀐 것이 아니다. `baseline`에 없는 칸은 빈 칸으로 본다.
 * 키는 {@link cellKey}다.
 */
export function diffChapterNameCells(baseline: Record<string, string>, current: Record<string, string>): ChapterNameChange[] {
  const changes: ChapterNameChange[] = []
  for (const [key, value] of Object.entries(current)) {
    const trimmed = value.trim()
    if (trimmed === (baseline[key] ?? '').trim()) continue
    const sep = key.lastIndexOf(':')
    changes.push({ tribeId: key.slice(0, sep), chapterNo: Number(key.slice(sep + 1)), name: trimmed })
  }
  return changes
}

export type ParseChangesResult =
  | { ok: true; changes: ChapterNameChange[] }
  | { ok: false; error: string }

/** 요청 본문 `{ changes: [{ tribe_id, chapter_no, name }] }`을 읽는다. 이름은 앞뒤 공백을 지우고 길이를 확인한다 */
export function parseChapterNameChanges(body: unknown): ParseChangesResult {
  const list = (body as { changes?: unknown } | null)?.changes
  if (!Array.isArray(list)) return { ok: false, error: CHAPTER_NAMES_BODY_INVALID_MESSAGE }

  const changes: ChapterNameChange[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const item = raw as { tribe_id?: unknown; chapter_no?: unknown; name?: unknown } | null
    const tribeId = item?.tribe_id
    const chapterNo = item?.chapter_no
    const name = item?.name
    if (typeof tribeId !== 'string' || !isUuid(tribeId)) return { ok: false, error: CHAPTER_NAMES_BODY_INVALID_MESSAGE }
    if (typeof chapterNo !== 'number' || !Number.isInteger(chapterNo) || chapterNo < 1) {
      return { ok: false, error: CHAPTER_NAMES_BODY_INVALID_MESSAGE }
    }
    if (name !== null && typeof name !== 'string') return { ok: false, error: CHAPTER_NAMES_BODY_INVALID_MESSAGE }

    const trimmed = (name ?? '').trim()
    if (charLength(trimmed) > CHAPTER_NAME_MAX_LENGTH) return { ok: false, error: CHAPTER_NAMES_TOO_LONG_MESSAGE }

    const key = cellKey(tribeId, chapterNo)
    if (seen.has(key)) return { ok: false, error: CHAPTER_NAMES_DUPLICATE_MESSAGE }
    seen.add(key)
    changes.push({ tribeId, chapterNo, name: trimmed })
  }
  return { ok: true, changes }
}

/** `chapter_names` 한 번 읽기가 PostgREST 기본 상한(1,000행)에 닿으면 조용히 잘린 것일 수 있어 읽지 못한 것으로 본다 */
const NAMES_READ_LIMIT = 1000

/** 이름 표를 읽는다. 읽지 못하면 던진다(호출부가 오류 화면이나 고정 문구로 바꾼다) */
export async function readChapterNamesTable(supabase: SupabaseClient): Promise<ChapterNamesTableData> {
  const [tribesRead, chaptersRead, namesRead] = await Promise.all([
    supabase.from('tribes').select('id, name, is_active, sort_order').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    supabase.from('chapter_definitions').select('chapter_no').order('chapter_no', { ascending: true }),
    supabase.from('chapter_names').select('tribe_id, chapter_no, name').limit(NAMES_READ_LIMIT),
  ])
  throwOnQueryError(tribesRead.error, 'chapter-names/tribes')
  throwOnQueryError(chaptersRead.error, 'chapter-names/chapters')
  throwOnQueryError(namesRead.error, 'chapter-names/names')

  const nameRows = (namesRead.data ?? []) as Array<{ tribe_id: string; chapter_no: number; name: unknown }>
  if (nameRows.length >= NAMES_READ_LIMIT) {
    throw new Error(`[chapter-names] chapter_names가 ${NAMES_READ_LIMIT}행에 닿아 잘렸을 수 있어 읽기를 멈췄어요`)
  }

  const tribes = ((tribesRead.data ?? []) as Array<{ id: string; name: string; is_active: boolean | null }>).map((t) => ({
    id: t.id,
    name: t.name,
    isActive: t.is_active !== false,
  }))
  const chapterNos = ((chaptersRead.data ?? []) as Array<{ chapter_no: number }>).map((c) => c.chapter_no)

  const cells: ChapterNameCell[] = []
  for (const row of nameRows) {
    const name = normalizeChapterName(row.name)
    if (name !== null) cells.push({ tribeId: row.tribe_id, chapterNo: row.chapter_no, name })
  }
  return { tribes, chapterNos, cells }
}

/** 저장 중 DB 오류. `partial`이 참이면 앞 단계는 이미 저장됐다 */
export class ChapterNamesSaveError extends Error {
  constructor(
    message: string,
    readonly partial: boolean
  ) {
    super(message)
    this.name = 'ChapterNamesSaveError'
  }
}

export type SaveChangesResult = { ok: true; saved: number; cleared: number } | { ok: false; error: string }

/**
 * 바뀐 칸을 저장한다. 이름이 있는 칸은 upsert, 빈 칸은 행 삭제다. 없는 트라이브·챕터가 섞여 있으면 아무것도 쓰지 않고 `{ ok: false }`다.
 * DB 오류는 {@link ChapterNamesSaveError}로 던진다(원문은 `console.error`에만 남는다).
 */
export async function saveChapterNameChanges(supabase: SupabaseClient, changes: ChapterNameChange[]): Promise<SaveChangesResult> {
  if (changes.length === 0) return { ok: true, saved: 0, cleared: 0 }

  const tribeIds = [...new Set(changes.map((c) => c.tribeId))]
  const chapterNos = [...new Set(changes.map((c) => c.chapterNo))]
  const [tribesRead, chaptersRead] = await Promise.all([
    supabase.from('tribes').select('id').in('id', tribeIds),
    supabase.from('chapter_definitions').select('chapter_no').in('chapter_no', chapterNos),
  ])
  if (tribesRead.error || chaptersRead.error) {
    console.error('[chapter-names] 저장 전 존재 확인 실패:', tribesRead.error ?? chaptersRead.error)
    throw new ChapterNamesSaveError('존재 확인 실패', false)
  }
  const knownTribes = new Set(((tribesRead.data ?? []) as Array<{ id: string }>).map((t) => t.id))
  const knownChapters = new Set(((chaptersRead.data ?? []) as Array<{ chapter_no: number }>).map((c) => c.chapter_no))
  if (changes.some((c) => !knownTribes.has(c.tribeId) || !knownChapters.has(c.chapterNo))) {
    return { ok: false, error: CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE }
  }

  const toSave = changes.filter((c) => c.name !== '')
  const toClear = changes.filter((c) => c.name === '')
  /** 앞 단계가 이미 저장했는지 — 뒤 단계가 실패했을 때 일부만 저장된 것인지 가른다 */
  let wroteAny = false

  if (toSave.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('chapter_names')
      .upsert(
        toSave.map((c) => ({ tribe_id: c.tribeId, chapter_no: c.chapterNo, name: c.name, updated_at: now })),
        { onConflict: 'tribe_id,chapter_no' }
      )
    if (error) {
      console.error('[chapter-names] 이름 저장 실패:', error)
      throw new ChapterNamesSaveError('이름 저장 실패', false)
    }
    wroteAny = true
  }

  // 트라이브마다 한 번씩 지운다 — 같은 트라이브의 빈 칸 챕터를 묶어 `in`으로 보낸다
  const clearByTribe = new Map<string, number[]>()
  for (const c of toClear) clearByTribe.set(c.tribeId, [...(clearByTribe.get(c.tribeId) ?? []), c.chapterNo])
  for (const [tribeId, nos] of clearByTribe) {
    const { error } = await supabase.from('chapter_names').delete().eq('tribe_id', tribeId).in('chapter_no', nos)
    if (error) {
      console.error('[chapter-names] 이름 지우기 실패:', error)
      throw new ChapterNamesSaveError('이름 지우기 실패', wroteAny)
    }
    wroteAny = true
  }

  return { ok: true, saved: toSave.length, cleared: toClear.length }
}
