/**
 * 앰비언트 드랍 「축 3: 대상 컬렉션」 확정 — 순수 함수 (티켓 20260930_1516)
 *
 * 공개 전·기간이 끝난 컬렉션에는 드랍하지 않는다. 드랍 대상은 「노출 중」 컬렉션(`is_active` 그리고
 * 노출 기간 안, 판정은 `lib/itembook/visibility.ts`)뿐이다. DB 조회(`index.ts`)와 분리해 세 모드
 * (random·explicit·「전체」)를 결정론적으로 테스트한다.
 *
 * 드랍 제외(`drop_excluded`) 컬렉션도 대상이 아니다(티켓 20261005_1957). 이 함수는 판정하지 않고, 호출부가 읽어 넘기는
 * `droppableIds`에서 이미 빠져 있다 — 노출 중이 아닌 컬렉션과 같은 경로로 `excludedCollectionIds`에 남는다.
 *
 * 주의: 호출부는 `effectiveCollectionIds`가 빈 배열이면 「전체 컬렉션」으로 읽는다. 그래서 대상이 없을 때
 * 빈 배열로 흘려보내면 모든 컬렉션으로 넓어진다 — 이 함수는 그 경우를 `reason`으로 돌려주고, 호출부는
 * `reason`이 있으면 드랍하지 않고 건너뛴다. 「전체」 설정은 `effectiveCollectionIds`를 빈 배열로 두되
 * `restrictToCollectionIds`로 후보 배지를 노출 중 컬렉션으로 좁힌다.
 */

export interface ResolveAmbientTargetInput {
  /** 이번 실행이 컬렉션 축을 무작위로 정하는가(`collection_mode='random'`) */
  useRandom: boolean
  /** 설정된 `collection_ids`. 빈 배열은 「전체 컬렉션」 */
  configIds: readonly string[]
  /** 지금 노출 중이고 드랍 제외가 아닌 컬렉션 id 전부 */
  droppableIds: readonly string[]
  /** 배열에서 하나를 고른다(비었으면 null). 운영은 `pickRandom`, 테스트는 결정값을 넘긴다 */
  pick: (ids: readonly string[]) => string | null
}

export interface ResolvedAmbientTarget {
  /** 이번 실행의 대상 컬렉션 id. 빈 배열은 「전체」(`restrictToCollectionIds`로 좁혀진다) 또는 대상 없음(`reason`) */
  effectiveCollectionIds: string[]
  /** 후보 배지를 이 컬렉션들로만 좁힌다. null이면 `effectiveCollectionIds`만 쓴다 */
  restrictToCollectionIds: string[] | null
  /** 설정에는 있었지만 노출 중이 아니거나 드랍 제외라 뺀 컬렉션 id */
  excludedCollectionIds: string[]
  /** 있으면 이번 실행은 드랍하지 않는다 */
  reason?: 'no_eligible_collection'
}

export function resolveAmbientTargetCollections(input: ResolveAmbientTargetInput): ResolvedAmbientTarget {
  const { useRandom, configIds, droppableIds, pick } = input
  const droppable = new Set(droppableIds)

  // random — 노출 중 컬렉션에서 하나. 하나도 없으면 비어 있는 채로 전체로 넓어지지 않게 건너뛴다.
  if (useRandom) {
    const picked = pick(droppableIds)
    if (!picked) return skipped([])
    return { effectiveCollectionIds: [picked], restrictToCollectionIds: null, excludedCollectionIds: [] }
  }

  // explicit, 「전체」 — 모든 컬렉션이 아니라 노출 중 컬렉션 전체
  if (configIds.length === 0) {
    if (droppableIds.length === 0) return skipped([])
    return { effectiveCollectionIds: [], restrictToCollectionIds: [...droppableIds], excludedCollectionIds: [] }
  }

  // explicit, 컬렉션 지정 — 노출 중인 것만 남기고 나머지는 사유와 함께 기록한다
  const kept = configIds.filter((id) => droppable.has(id))
  const excluded = configIds.filter((id) => !droppable.has(id))
  if (kept.length === 0) return skipped(excluded)
  return { effectiveCollectionIds: kept, restrictToCollectionIds: null, excludedCollectionIds: excluded }
}

function skipped(excludedCollectionIds: string[]): ResolvedAmbientTarget {
  return {
    effectiveCollectionIds: [],
    restrictToCollectionIds: null,
    excludedCollectionIds,
    reason: 'no_eligible_collection',
  }
}
