import { createHash } from 'node:crypto'
import type { createServiceClient } from '@/lib/supabase/server'

/** 티켓 20261113_1131 — 컬렉션 검색·아이템 목록·상태 계산·마지막 프리셋 조회 */

export type ServiceClient = ReturnType<typeof createServiceClient>

export type ItemImageStatus = 'none' | 'candidates' | 'applied'

export const RECENT_GENERATIONS_PER_ITEM = 10
export const MAX_BOOK_SEARCH_RESULTS = 30

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** 저장소 경로에 한글 이름을 쓰지 않으려고 아이템 이름에서 만드는 짧은 식별자 */
export function itemSlug(itemName: string): string {
  return sha256Hex(itemName).slice(0, 12)
}

export function computeItemStatus(imageUrl: string | null, hasUnappliedGeneration: boolean): ItemImageStatus {
  if (imageUrl) return 'applied'
  return hasUnappliedGeneration ? 'candidates' : 'none'
}

export interface BookSearchResult {
  id: string
  name: string
}

/** 컬렉션 이름 검색 — form_description 값이 있는 배지를 가진 컬렉션만, 최대 30개 */
export async function searchBooks(supabase: ServiceClient, q: string): Promise<BookSearchResult[]> {
  const term = q.trim().replace(/[%_,()]/g, ' ')
  let query = supabase.from('item_books').select('id, name').order('name').limit(200)
  if (term) query = query.ilike('name', `%${term}%`)
  const { data: books, error } = await query
  if (error) throw new Error(error.message)
  if (!books || books.length === 0) return []

  const { data: badges, error: badgeErr } = await supabase
    .from('badges')
    .select('item_book_id')
    .in(
      'item_book_id',
      books.map((b) => b.id)
    )
    .not('form_description', 'is', null)
    .is('deleted_at', null)
    .limit(5000)
  if (badgeErr) throw new Error(badgeErr.message)

  const withDescription = new Set((badges ?? []).map((b) => b.item_book_id))
  return books.filter((b) => withDescription.has(b.id)).slice(0, MAX_BOOK_SEARCH_RESULTS)
}

export interface ItemGenerationSummary {
  id: string
  preset_id: string | null
  preset_version: number
  prompt: string
  candidate_urls: string[]
  status: string
  applied_index: number | null
  applied_url: string | null
  feedback: string | null
  error: string | null
  created_at: string
  applied_at: string | null
}

export interface BookItem {
  itemName: string
  formDescription: string
  imageUrl: string | null
  descriptionEn: string | null
  descriptionSource: string | null
  stale: boolean
  status: ItemImageStatus
  generations: ItemGenerationSummary[]
}

export interface BookItemsResult {
  items: BookItem[]
  lastPresetId: string | null
}

/** 한 컬렉션의 아이템 목록. 아이템 = (item_book_id, name) 묶음 */
export async function listBookItems(supabase: ServiceClient, bookId: string): Promise<BookItemsResult> {
  const [badgesRes, promptsRes, gensRes] = await Promise.all([
    supabase
      .from('badges')
      .select('name, form_description, image_url')
      .eq('item_book_id', bookId)
      .not('form_description', 'is', null)
      .is('deleted_at', null)
      .limit(1000),
    supabase
      .from('badge_image_item_prompts')
      .select('item_name, description_en, source, source_hash')
      .eq('item_book_id', bookId),
    supabase
      .from('badge_image_generations')
      .select(
        'id, item_name, preset_id, preset_version, prompt, candidate_urls, status, applied_index, applied_url, feedback, error, created_at, applied_at'
      )
      .eq('item_book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(1000),
  ])
  if (badgesRes.error) throw new Error(badgesRes.error.message)
  if (promptsRes.error) throw new Error(promptsRes.error.message)
  if (gensRes.error) throw new Error(gensRes.error.message)

  const prompts = new Map((promptsRes.data ?? []).map((p) => [p.item_name, p]))
  const gensByItem = new Map<string, ItemGenerationSummary[]>()
  for (const g of gensRes.data ?? []) {
    const list = gensByItem.get(g.item_name) ?? []
    list.push(g)
    gensByItem.set(g.item_name, list)
  }

  const byName = new Map<string, { formDescription: string; imageUrl: string | null }>()
  for (const b of badgesRes.data ?? []) {
    const cur = byName.get(b.name)
    if (!cur) byName.set(b.name, { formDescription: b.form_description ?? '', imageUrl: b.image_url })
    else if (!cur.imageUrl && b.image_url) cur.imageUrl = b.image_url
  }

  const items: BookItem[] = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([itemName, v]) => {
      const prompt = prompts.get(itemName)
      const gens = gensByItem.get(itemName) ?? []
      return {
        itemName,
        formDescription: v.formDescription,
        imageUrl: v.imageUrl,
        descriptionEn: prompt?.description_en ?? null,
        descriptionSource: prompt?.source ?? null,
        stale: prompt ? prompt.source_hash !== sha256Hex(v.formDescription) : false,
        status: computeItemStatus(
          v.imageUrl,
          gens.some((g) => g.status === 'generated')
        ),
        generations: gens.slice(0, RECENT_GENERATIONS_PER_ITEM),
      }
    })

  // 이 컬렉션에서 마지막으로 쓴 프리셋 — 가장 최근 생성 기록 기준(이미 최신순)
  const lastPresetId = (gensRes.data ?? []).find((g) => g.preset_id)?.preset_id ?? null
  return { items, lastPresetId }
}

/** 아이템 하나의 형태 묘사(4행 중 값이 있는 첫 행). 없으면 null */
export async function getItemFormDescription(
  supabase: ServiceClient,
  bookId: string,
  itemName: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('badges')
    .select('form_description')
    .eq('item_book_id', bookId)
    .eq('name', itemName)
    .not('form_description', 'is', null)
    .is('deleted_at', null)
    .limit(1)
  if (error) throw new Error(error.message)
  return data?.[0]?.form_description ?? null
}
