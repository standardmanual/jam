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
import type { FeedPalette } from '@/lib/today/feedAssign'
import { fetchFeedPalette } from '@/lib/today/feedColorOverridesRead'
import { imageColorsForCard, type FeedImageColorInput } from '@/lib/today/feedImageColors'

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

/** 자동 배정에 쓸 이미지 대표 색을 고르는 재료(티켓 20261121_1828). 저장 요청이 쓰는 값을 그대로 넘긴다. */
export interface FeedCardImageSource {
  feedType: string | null | undefined
  boxKind: string | null | undefined
  /** 이 저장이 쓰는 커버 대표 색(`today_cards.cover_colors`). 커버가 바뀌었는데 추출이 실패했으면 낡은 값이 아니라 `null`을 넘긴다. */
  coverColors: unknown
  /** 카드가 가리키는 배지 id(`badge_ids`). 배지 유형일 때만 조회한다. */
  badgeIds: readonly string[] | null | undefined
}

const BADGE_COLOR_TYPES: readonly string[] = ['badge_intro', 'badge_only', 'drop_pickup']

/**
 * 배지 대표 색(`badges.bg_colors`)을 `badge_ids` 순서로 읽는다. 삭제돼 행이 없는 배지는 뺀다(홈이 «첫 배지»를 고르는 방식과 같다).
 * 한 번만 조회하고(칸 `bg_colors`만), 조회가 실패하면 `null`을 돌려주고 서버 로그에 남긴다(호출하는 쪽은 이미지 규칙 없이 진행한다).
 */
export async function fetchBadgeBgColors(
  client: ServiceClient,
  badgeIds: readonly string[],
  logLabel = '[홈피드 카드 배지 대표 색 조회 오류]',
): Promise<unknown[] | null> {
  const ids = [...new Set(badgeIds.filter((id) => typeof id === 'string' && id !== ''))]
  if (ids.length === 0) return []
  // 삭제된 배지는 홈이 그리지 않는다(`fetchBadgesById`도 `deleted_at is null`만 읽는다). 홈의 «첫 배지»와 같게 뺀다.
  const { data, error } = await client.from('badges').select('id, bg_colors').in('id', ids).is('deleted_at', null)
  if (error) {
    console.error(logLabel, error)
    return null
  }
  const colorsById = new Map<string, unknown>()
  for (const row of (data ?? []) as Array<{ id: string; bg_colors: unknown }>) colorsById.set(row.id, row.bg_colors)
  return badgeIds.filter((id) => colorsById.has(id)).map((id) => colorsById.get(id))
}

/**
 * 카드 한 장의 이미지 규칙 입력(`imageHexes`·`chipOnImage`)을 만든다. 적용 대상이 아닌 유형은 DB를 읽지 않고, 배지 유형만 배지 대표 색을 한 번 읽는다.
 * 조회가 실패하면 빈 입력(이미지 규칙 없음)이다 — 색은 보조 입력이라 저장을 막지 않는다.
 */
export async function fetchFeedCardImageColors(
  client: ServiceClient,
  source: FeedCardImageSource,
  logLabel?: string,
): Promise<FeedImageColorInput> {
  let badgeColors: unknown[] | null = []
  if (source.feedType && BADGE_COLOR_TYPES.includes(source.feedType) && source.badgeIds && source.badgeIds.length > 0) {
    badgeColors = await fetchBadgeBgColors(client, source.badgeIds, logLabel)
    if (badgeColors === null) badgeColors = []
  }
  return imageColorsForCard({
    feedType: source.feedType,
    boxKind: source.boxKind,
    coverColors: source.coverColors,
    badgeColors,
  })
}

/**
 * 비어 있는 시드와 색 키를 정한다(저장은 호출하는 쪽이 한다). 지정한 값은 덮어쓰지 않고, 같은 시드·같은 빈도는 같은 값이다.
 * `columns.feed_seed`가 있으면 그 값이 색 계산 시드이자 저장 시드다(난수는 뽑지 않는다). 없을 때만 서버 난수로 새로 뽑는다(`random`은 시험이 바꿔 끼운다, 티켓 20261121_2113). 제외 조합은 운영 코드에 연결된 목록이 없어 비워 둔다 —
 * 연결되면 이 한 곳만 바꾸면 어드민과 에이전트 두 경로가 함께 바뀐다.
 * `imageSource`를 주면 이미지 대표 색(커버 색·배지 색)으로 자동 배경·칩을 거른다(티켓 20261121_1828). 주지 않으면 이전과 같다.
 * 색 규칙은 컬러셋 교체로 덮어쓴 hex로 판정한다(티켓 20261121_2145): `palette`를 주면 그 표를, 안 주면 `feed_color_overrides`를 한 번 읽어 합친다.
 * 읽기가 실패하면 기본 팔레트로 정하고 서버 로그에만 남긴다(색은 보조 입력이라 저장을 막지 않는다).
 */
export async function completeFeedCardValues(
  client: ServiceClient,
  columns: DecideFeedCardValuesInput['columns'],
  period: FeedCardPeriod,
  random: () => number = serverRandomUint32,
  logLabel?: string,
  imageSource?: FeedCardImageSource,
  palette?: FeedPalette,
): Promise<DecidedFeedCardValues> {
  const overlappingBgUsage = await fetchOverlappingBgUsage(client, period, logLabel)
  const image = imageSource ? await fetchFeedCardImageColors(client, imageSource, logLabel) : undefined
  const resolvedPalette = palette ?? (await fetchFeedPalette(client, logLabel))
  return decideFeedCardValues({
    columns,
    seed: columns.feed_seed ?? createFeedSeed(random),
    overlappingBgUsage,
    excludedPairs: [],
    image,
    palette: resolvedPalette,
  })
}
