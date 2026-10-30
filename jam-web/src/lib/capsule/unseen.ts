/**
 * 보지 않은 캡슐 결과 읽기와 «봤어요» 처리 (티켓 20261028_1740 2회, 상위 D12)
 *
 * 동기화·서비스 활동 잼 지급이 남긴 `capsule_unseen_results`(`recordUnseenCapsuleResult`)를 화면이 쓰는 모양으로 내려주고, 연출을 끝낸 뒤 `seen_at`을 채운다.
 * 이 표는 service_role 전용이라 호출부가 서비스 클라이언트를 넘기고, 대상 유저는 세션 유저뿐이다.
 *
 * 규칙
 *  - 합치기: `seen_at IS NULL`인 행을 오래된 순서로 최대 `CAPSULE_UNSEEN_MAX_IDS`건 읽어 이벤트를 열린 순서대로 이어 붙인다(여러 동기화가 쌓여 있어도 연출은 한 번).
 *    50건을 넘게 쌓였으면 나머지는 «봤어요» 뒤 다음 읽기에서 나온다.
 *  - 깨진 행(`payload.version` 불일치, `events`가 배열이 아님, 이벤트 모양이 맞지 않음)은 건너뛰고 로그만 남긴다. 건너뛴 행은 `ids`에 넣지 않아 «봤어요»로 지워지지 않는다.
 *  - 챕터 배지: 합친 `reachedChapters`에 든 챕터마다 `badges.condition_json.chapter_reached`가 그 챕터인 액티비티 배지 가운데 그 유저가 이미 `user_activity_badges`에 가진 것만 싣는다.
 *    동기화 끝 판정이 아직 발급하지 않은 배지는 싣지 않는다(이 읽기는 발급하지 않는다). 배지 조회가 실패하면 결과는 그대로 내리고 `chapterBadges: []`다(로그).
 *
 * 던지는 쪽과 던지지 않는 쪽
 *  - `readUnseenCapsuleResult`·`markUnseenCapsuleResultsSeen`은 **행 조회·갱신이 실패하면 던진다.** 호출부(라우트)가 500으로 바꾸고, 화면은 «보여 주지 않고 다음에 다시»로 처리한다.
 *  - 챕터 배지 조회는 던지지 않는다(위).
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CAPSULE_UNSEEN_MAX_IDS,
  type CapsuleChapterBadge,
  type CapsuleOpenedItem,
  type CapsuleRarity,
  type CapsuleUnseenEventView,
  type CapsuleUnseenResult,
} from './capsule-contract'
import { CAPSULE_UNSEEN_PAYLOAD_VERSION } from './sync-auto-fill'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 이벤트 하나를 화면용 모양으로 줄인다. 모양이 맞지 않으면 null */
function toEventView(raw: unknown): CapsuleUnseenEventView | null {
  if (!isRecord(raw)) return null
  const { openId, items, reachedChapters } = raw
  if (typeof openId !== 'string' || openId === '') return null
  if (!Array.isArray(items)) return null
  if (!Array.isArray(reachedChapters) || !reachedChapters.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 1)) return null
  return { openId, items: items as CapsuleOpenedItem[], reachedChapters: [...(reachedChapters as number[])] }
}

/** 행 하나의 payload를 이벤트 목록으로 푼다. 깨졌으면 null */
function parseRowEvents(payload: unknown): CapsuleUnseenEventView[] | null {
  if (!isRecord(payload) || payload.version !== CAPSULE_UNSEEN_PAYLOAD_VERSION || !Array.isArray(payload.events)) return null
  const events: CapsuleUnseenEventView[] = []
  for (const raw of payload.events) {
    const view = toEventView(raw)
    if (!view) return null
    events.push(view)
  }
  return events
}

const CHAPTER_BADGE_RARITIES: readonly string[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 합친 오른 챕터에 해당하는 챕터 배지 가운데 유저가 이미 받은 것. 조회가 실패해도 던지지 않고 빈 배열을 돌려준다.
 * 같은 챕터에 배지가 여럿이면 모두 싣는다(챕터가 낮은 순, 같은 챕터는 이름 순).
 */
async function readReceivedChapterBadges(
  supabase: SupabaseClient,
  userId: string,
  reachedChapters: readonly number[]
): Promise<CapsuleChapterBadge[]> {
  const chapters = [...new Set(reachedChapters)]
  if (chapters.length === 0) return []
  try {
    const { data: badgeRows, error: badgeError } = await supabase
      .from('badges')
      .select('id, name, description, image_url, rarity, level, condition_json')
      .eq('type', 'activity')
      .is('deleted_at', null)
      .in('condition_json->>chapter_reached', chapters.map(String))
    if (badgeError) {
      console.error(`[capsule-unseen] 챕터 배지 조회 실패 — 배지 없이 결과를 내린다 (userId: ${userId}):`, badgeError)
      return []
    }
    const candidates = (badgeRows ?? []).flatMap((row) => {
      const condition = row.condition_json as unknown
      const chapter = isRecord(condition) ? Number(condition.chapter_reached) : NaN
      return chapters.includes(chapter) ? [{ row, chapter }] : []
    })
    if (candidates.length === 0) return []

    const { data: ownedRows, error: ownedError } = await supabase
      .from('user_activity_badges')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', candidates.map((c) => c.row.id as string))
    if (ownedError) {
      console.error(`[capsule-unseen] 받은 챕터 배지 조회 실패 — 배지 없이 결과를 내린다 (userId: ${userId}):`, ownedError)
      return []
    }
    const owned = new Set((ownedRows ?? []).map((r) => r.badge_id as string))

    return candidates
      .filter((c) => owned.has(c.row.id as string))
      .sort((a, b) => a.chapter - b.chapter || String(a.row.name).localeCompare(String(b.row.name), 'ko'))
      .map(({ row }) => ({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string,
        imageUrl: (row.image_url as string | null) ?? null,
        rarity: CHAPTER_BADGE_RARITIES.includes(row.rarity as string) ? (row.rarity as CapsuleRarity) : null,
        level: typeof row.level === 'number' ? row.level : null,
      }))
  } catch (e) {
    console.error(`[capsule-unseen] 챕터 배지 조회 예외 — 배지 없이 결과를 내린다 (userId: ${userId}):`, e)
    return []
  }
}

/**
 * 보지 않은 결과를 하나로 합쳐 돌려준다. 읽을 행이 없거나 읽을 수 있는 행이 하나도 없으면 null.
 * 행 조회가 실패하면 던진다(파일 머리말).
 */
export async function readUnseenCapsuleResult(supabase: SupabaseClient, userId: string): Promise<CapsuleUnseenResult | null> {
  const { data, error } = await supabase
    .from('capsule_unseen_results')
    .select('id, payload')
    .eq('user_id', userId)
    .is('seen_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(CAPSULE_UNSEEN_MAX_IDS)
  if (error) throw new Error(`보지 않은 캡슐 결과 조회 실패: ${error.message}`)

  const ids: string[] = []
  const events: CapsuleUnseenEventView[] = []
  for (const row of data ?? []) {
    const rowEvents = parseRowEvents(row.payload)
    if (!rowEvents) {
      console.error(`[capsule-unseen] 깨진 보지 않은 캡슐 결과 행을 건너뛴다 (userId: ${userId}, rowId: ${String(row.id)})`)
      continue
    }
    ids.push(row.id as string)
    events.push(...rowEvents)
  }
  if (ids.length === 0) return null

  const chapterBadges = await readReceivedChapterBadges(
    supabase,
    userId,
    events.flatMap((e) => e.reachedChapters)
  )
  return { ids, events, chapterBadges }
}

/**
 * 보지 않은 결과 행을 «봤어요»로 바꾼다. 본인의 행 가운데 아직 `seen_at`이 비어 있는 것만 바꾸므로, 이미 본 행·남의 행·없는 id는 건드리지 않고
 * 같은 요청을 두 번 보내도 두 번째는 0건이다. 바뀐 행 수를 돌려준다. 갱신이 실패하면 던진다.
 */
export async function markUnseenCapsuleResultsSeen(
  supabase: SupabaseClient,
  userId: string,
  ids: readonly string[],
  now: Date = new Date()
): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase
    .from('capsule_unseen_results')
    .update({ seen_at: now.toISOString() })
    .eq('user_id', userId)
    .in('id', [...ids])
    .is('seen_at', null)
    .select('id')
  if (error) throw new Error(`보지 않은 캡슐 결과 확인 처리 실패: ${error.message}`)
  return data?.length ?? 0
}
