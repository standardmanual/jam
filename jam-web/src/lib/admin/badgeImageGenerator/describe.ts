import { describeItem, reviseDescription } from './claude'
import { getItemFormDescription, sha256Hex, type ServiceClient } from './items'

/**
 * 아이템 묘사 문장 확보 (티켓 20261113_1131 3번). describe·generate 라우트가 함께 쓴다.
 * Claude는 ① 저장본이 없거나 stale일 때(또는 force) ② feedback이 있을 때만 부른다.
 * manualText는 Claude 없이 그대로 저장한다.
 */
export interface EnsureDescriptionInput {
  bookId: string
  itemName: string
  manualText?: string
  feedback?: string
  force?: boolean
}

export interface EnsuredDescription {
  descriptionEn: string
  source: 'claude' | 'manual'
  claudeCalled: boolean
}

export class DescriptionError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export async function ensureDescription(
  supabase: ServiceClient,
  input: EnsureDescriptionInput
): Promise<EnsuredDescription> {
  const { bookId, itemName } = input
  const formDescription = await getItemFormDescription(supabase, bookId, itemName)
  if (!formDescription) throw new DescriptionError('형태 묘사가 있는 아이템을 찾을 수 없습니다.', 404)
  const hash = sha256Hex(formDescription)

  const { data: saved, error: savedErr } = await supabase
    .from('badge_image_item_prompts')
    .select('description_en, source, source_hash')
    .eq('item_book_id', bookId)
    .eq('item_name', itemName)
    .maybeSingle()
  if (savedErr) throw new Error(savedErr.message)

  const manual = input.manualText?.trim()
  const feedback = input.feedback?.trim()

  let descriptionEn: string
  let source: 'claude' | 'manual'
  let claudeCalled = false

  if (manual) {
    descriptionEn = manual.replace(/\s*[\r\n]+\s*/g, ' ')
    source = 'manual'
  } else if (feedback && saved?.description_en) {
    descriptionEn = await reviseDescription(saved.description_en, feedback)
    source = 'claude'
    claudeCalled = true
  } else if (saved && saved.source_hash === hash && !input.force && !feedback) {
    return { descriptionEn: saved.description_en, source: saved.source as 'claude' | 'manual', claudeCalled: false }
  } else {
    descriptionEn = await describeItem(itemName, formDescription)
    source = 'claude'
    claudeCalled = true
    if (feedback) {
      descriptionEn = await reviseDescription(descriptionEn, feedback)
    }
  }

  const { error } = await supabase.from('badge_image_item_prompts').upsert(
    {
      item_book_id: bookId,
      item_name: itemName,
      description_en: descriptionEn,
      source_hash: hash,
      source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'item_book_id,item_name' }
  )
  if (error) throw new Error(error.message)
  return { descriptionEn, source, claudeCalled }
}
