/**
 * 홈피드 카드 등록·수정 때 비어 있는 시드와 색을 정하는 서버 보조 (티켓 20261121_1531, 상위 20261120_2026 6회차-2).
 *
 * 규칙 자체는 `feedCardFields.ts`의 `decideFeedCardValues`(순수)가 정하고, 이 파일은 그 규칙에 서버가 채워 주는 입력(서버 난수 시드,
 * 같은 시기에 노출되는 카드의 배경색 사용 빈도)을 붙인다. 어드민 저장 라우트 두 개(`/api/admin/today`·`/api/admin/today/[id]`)와
 * 운영 묶음 카드 핸들러(`opsInbox/execute/homeFeedCard.ts`의 `create`)가 같은 코드를 쓴다.
 *
 * 번들 경계: 핸들러가 이 파일을 값으로 가져오고 요약창이 그 핸들러를 끌어오므로, 이 파일은 Supabase·`node:`·서버 모듈을 값으로 가져오지 않는다.
 * 클라이언트는 호출하는 쪽이 넘겨 주고(`client`), 여기서는 `import type`으로 모양만 읽는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import {
  countBgUsage,
  createFeedSeed,
  decideFeedCardValues,
  type DecidedFeedCardValues,
  type DecideFeedCardValuesInput,
} from '@/lib/admin/feedCardFields'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 같은 시기 노출 카드를 찾는 기간. 기간이 비어 있으면(`null`·없음·글자가 아님) 빈 빈도로 정한다. */
export interface FeedCardPeriod {
  startsAt: unknown
  endsAt: unknown
  /** 빈도에서 뺄 카드 ID(수정 저장은 자기 자신, 등록은 이미 정해 둔 새 카드 ID) */
  excludeId?: string
}

/** 서버 난수(0 이상 2^32 미만 정수). 시험할 수 있도록 `createFeedSeed`가 공급 함수로 받는다. */
export function serverRandomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/**
 * 같은 시기에 노출되는 카드의 배경색 사용 빈도. 게시 기간(`starts_at`~`ends_at`)이 겹치고 `bg_color_key`가 있는 카드를 센다.
 * 기간이 비어 있거나 조회가 실패하면 빈 빈도로 정한다(빈도는 배경색을 고르게 퍼뜨리는 보조 입력이라 저장을 막지 않는다).
 * 조회 오류는 서버 로그에만 남긴다(`logLabel`이 로그 머리말이다).
 */
export async function fetchOverlappingBgUsage(
  client: ServiceClient,
  { startsAt, endsAt, excludeId }: FeedCardPeriod,
  logLabel = '[홈피드 카드 배경색 사용 빈도 조회 오류]',
): Promise<Record<string, number>> {
  if (typeof startsAt !== 'string' || !startsAt || typeof endsAt !== 'string' || !endsAt) return {}
  let query = client.from('today_cards').select('bg_color_key')
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query.lte('starts_at', endsAt).gte('ends_at', startsAt).not('bg_color_key', 'is', null)
  if (error) {
    console.error(logLabel, error)
    return {}
  }
  return countBgUsage((data ?? []) as Array<{ bg_color_key: string | null }>)
}

/**
 * 비어 있는 시드와 색 키를 정한다(저장은 호출하는 쪽이 한다). 지정한 값은 덮어쓰지 않고, 같은 시드·같은 빈도는 같은 값이다.
 * 시드가 비어 있으면 서버 난수로 새로 뽑는다(`random`은 시험이 바꿔 끼운다). 제외 조합은 운영 코드에 연결된 목록이 없어 비워 둔다 —
 * 연결되면 이 한 곳만 바꾸면 어드민과 에이전트 두 경로가 함께 바뀐다.
 */
export async function completeFeedCardValues(
  client: ServiceClient,
  columns: DecideFeedCardValuesInput['columns'],
  period: FeedCardPeriod,
  random: () => number = serverRandomUint32,
  logLabel?: string,
): Promise<DecidedFeedCardValues> {
  const overlappingBgUsage = await fetchOverlappingBgUsage(client, period, logLabel)
  return decideFeedCardValues({ columns, seed: createFeedSeed(random), overlappingBgUsage, excludedPairs: [] })
}
