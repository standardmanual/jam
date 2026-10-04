/**
 * 컬렉션 등록 전 DB 검사(티켓 20261004_2039, 상위 20260930_1500 ⑩-a 가정 6). 운영툴 예약 등록의 컬렉션 핸들러(`opsInbox/execute/collectionLaunch.ts`)가 부른다.
 * 배지·미션·홈피드 검사(`badge.ts`·`mission.ts`·`homeFeed.ts`)와 같은 모양이다: 읽기 전용이고, 클라이언트는 최소 인터페이스로 받으며, `supabase`가 null이면 «건너뜀»으로 표시한다.
 *
 * 검사: 같은 이름의 기존 컬렉션(정확히 같은 이름, 있으면 막음), 트라이브 존재, 보상 배지의 존재·삭제 여부·종류(`type = 'activity'`).
 * 이름 UNIQUE가 DB에 없어서(`item_books` 이름 제약 없음) 같은 이름이 둘 생길 수 있고, 유저 화면에 같은 이름이 둘 보이므로 막는다.
 * 보상 배지가 같은 실행에서 만들 배지(연결로 채움)면 호출부가 `reward_badge_id`를 null로 비워 넘긴다(생성 순서가 존재를 보장한다).
 */
import { createCheckCollector } from './shared'
import type { RegisterChecksClient, RegisterDbCheckResult } from './shared'

/** 검사가 읽는 컬렉션 필드(`toCollectionLaunchRegisterInput`이 만든 payload의 일부). */
export interface CollectionDbCheckInput {
  name: string
  tribe_id?: string | null
  reward_badge_id?: string | null
}

/** 완성 보상 배지로 쓸 수 있는 배지 종류. 완성 보상 지급(`issueItemBookRewardBadges`)이 활동 배지를 전제한다(티켓 20261004_2039 가정 6). */
export const COLLECTION_REWARD_BADGE_TYPE = 'activity'

/**
 * DB를 읽어야 알 수 있는 검사를 돌린다(읽기 전용). `supabase`가 null이면 «건너뜀»으로 표시한다.
 * 반환: `{ checks: [{ label, status, detail }], errors: string[] }` — status는 통과·실패·건너뜀·해당 없음.
 */
export async function runCollectionDbChecks({
  supabase,
  collection,
}: {
  supabase: RegisterChecksClient | null | undefined
  collection: CollectionDbCheckInput
}): Promise<RegisterDbCheckResult> {
  const { checks, errors, add } = createCheckCollector(supabase)

  await add('이름 중복', true, async (client) => {
    const { data, error } = await client.from('item_books').select('id').eq('name', collection.name).limit(1)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    if (data && data.length > 0) return `같은 이름의 컬렉션이 이미 있어요(id: ${data[0].id}).`
    return null
  })

  await add('트라이브 존재', Boolean(collection.tribe_id), async (client) => {
    const { data, error } = await client.from('tribes').select('id').eq('id', collection.tribe_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `tribe_id에 해당하는 트라이브가 없어요: ${collection.tribe_id}`
  })

  // 보상 배지는 한 번만 읽는다: 있는지·삭제됐는지·종류가 맞는지를 같은 행으로 가른다. 라벨은 둘로 나눠 핸들러가 고정 문장을 고르게 한다.
  // 있는 배지일 때만 종류를 본다(읽지 못했거나 없거나 삭제된 배지는 앞 검사가 이미 실패로 기록했다).
  const read: { badgeType?: unknown } = {}
  await add('보상 배지 존재', Boolean(collection.reward_badge_id), async (client) => {
    const { data, error } = await client.from('badges').select('id, type, deleted_at').eq('id', collection.reward_badge_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    if (!data) return `reward_badge_id에 해당하는 배지가 없어요: ${collection.reward_badge_id}`
    if (data.deleted_at) return `reward_badge_id의 배지가 삭제됐어요: ${collection.reward_badge_id}`
    read.badgeType = data.type
    return null
  })

  await add('보상 배지 종류', Boolean(collection.reward_badge_id) && 'badgeType' in read, async () => {
    return read.badgeType === COLLECTION_REWARD_BADGE_TYPE
      ? null
      : `보상 배지는 활동 배지(type = '${COLLECTION_REWARD_BADGE_TYPE}')여야 해요(받은 종류: ${String(read.badgeType)}): ${collection.reward_badge_id}`
  })

  return { checks, errors }
}
