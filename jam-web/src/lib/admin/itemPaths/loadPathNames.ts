/**
 * 컬렉션별 획득 경로 화면에 보일 이름 읽기 (티켓 20261022_1136 2회)
 *
 * 얻을 길 계산(`loadItemPathInputs`)은 판정에 필요한 칸만 읽고 이름은 읽지 않는다. 화면이 한 쪽(컬렉션 10개)에 보일 컬렉션과 그 아이템 배지의 이름만 따로 읽는다.
 * 읽기만 하고 저장하지 않는다. 서비스 클라이언트를 인자로 받는다(시험은 가짜를 넘긴다).
 *
 * 이름은 보이는 글자일 뿐이라 못 찾은 이름은 맵에 없고(화면이 «이름을 모르는 …»으로 보인다), 어느 표든 읽기에 실패하면 던진다 — 일부만 이름이 붙은 화면을 만들지 않는다.
 * 모든 읽기는 `fetchAllRowsIn`(값을 나눠 안정 정렬로 끝까지 읽기)을 거친다. 관리자 ID 칸은 읽지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import type { PathNames } from './pathView'

type ServiceClient = ReturnType<typeof createServiceClient>

interface NamedRow {
  id: string
  name: string | null
}

function toNameMap(rows: readonly NamedRow[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const row of rows) {
    if (typeof row.name === 'string' && row.name.trim() !== '') names.set(row.id, row.name)
  }
  return names
}

/** 고른 컬렉션과 아이템 배지의 이름을 읽는다. 어느 표든 읽지 못하면 던진다 */
export async function loadPathNames(
  supabase: ServiceClient,
  ids: { collectionIds: readonly string[]; itemIds: readonly string[] },
): Promise<PathNames> {
  const [collectionRows, itemRows] = await Promise.all([
    fetchAllRowsIn<NamedRow, string>('path-names:item-books', 'id', ids.collectionIds, (chunk) =>
      supabase.from('item_books').select('id, name').in('id', chunk),
    ),
    fetchAllRowsIn<NamedRow, string>('path-names:item-badges', 'id', ids.itemIds, (chunk) =>
      supabase.from('badges').select('id, name').in('id', chunk),
    ),
  ])
  return { collections: toNameMap(collectionRows), items: toNameMap(itemRows) }
}
