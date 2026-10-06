/**
 * 일정표 서랍의 주소 값 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 URL `?drawer=item&item=`·`?drawer=day&date=`, 순수 함수 — DB·DOM 접근 없음).
 *
 * 서랍은 주소가 상태의 전부다 — 새로고침해도 유지되고, 주소를 공유하면 같은 서랍이 열린다. 열고 닫을 때는 **다른 키(`view`·`kind`·`tribe`·`pattern`·`sample` 등)를 그대로 두고**
 * `drawer`·`item`·`date`만 바꾼다(`history.replaceState`용 쿼리 문자열을 만든다 — 서버를 다시 부르지 않는다).
 *
 * - 항목 서랍: `drawer=item&item=<키>`. 키는 운영 항목 ID, 옛 카드 `card:<ID>`, 옛 미션 `mission:<ID>`(가정 12). 기준일(`date`)은 건드리지 않는다.
 * - 날짜 서랍: `drawer=day&date=YYYY-MM-DD`. 그 날짜가 기준일이 된다(같은 주 안에서만 열리므로 보이는 기간이 바뀌지 않는다). 항목 키는 지운다.
 * - 닫기: `drawer`·`item`을 지우고 `date`는 남긴다.
 * - 포커스 복귀: 서랍을 연 칸(항목·칸 머리)에 `data-drawer-trigger="item:<키>"`·`"day:<날짜>"`를 달아 두고, 닫을 때 그 칸을 이 선택자로 찾아 포커스를 돌려준다.
 *   같은 항목이 여러 날 칸에 걸쳐 있으면 선택자는 여럿을 가리키므로, 호출부는 **누른 요소**를 먼저 쓰고 이 선택자는 그 요소가 사라졌을 때만 쓴다.
 */
import type { ScheduleParams } from '@/lib/admin/opsSchedule/params'

/** 열린 서랍이 가리키는 곳. */
export type ScheduleDrawerTarget = { kind: 'item'; key: string } | { kind: 'day'; date: string }

const DRAWER_KEY = 'drawer'
const ITEM_KEY = 'item'
const DATE_KEY = 'date'

/** 주소에서 읽은 값(`parseScheduleParams`)으로 지금 열린 서랍을 얻는다. 닫혀 있으면 null이다. */
export function drawerTargetOf(params: Pick<ScheduleParams, 'drawer' | 'item' | 'date'>): ScheduleDrawerTarget | null {
  if (params.drawer === 'item' && params.item) return { kind: 'item', key: params.item }
  if (params.drawer === 'day') return { kind: 'day', date: params.date }
  return null
}

/** 같은 서랍인가(항목 키는 대소문자를 가리지 않는다). 둘 중 하나가 null이면 거짓이다. */
export function isSameDrawerTarget(a: ScheduleDrawerTarget | null, b: ScheduleDrawerTarget | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'item' ? a.key.toLowerCase() === (b as { key: string }).key.toLowerCase() : a.date === (b as { date: string }).date
}

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
}

/** 서랍을 연 뒤의 쿼리 문자열(`?` 없이, 비어 있을 수 있다). 다른 키와 그 순서는 그대로 두고 서랍 키만 바꾼다. */
export function openDrawerQuery(search: string, target: ScheduleDrawerTarget): string {
  const params = paramsOf(search)
  params.set(DRAWER_KEY, target.kind)
  if (target.kind === 'item') {
    params.set(ITEM_KEY, target.key)
  } else {
    params.delete(ITEM_KEY)
    params.set(DATE_KEY, target.date)
  }
  return params.toString()
}

/** 서랍을 닫은 뒤의 쿼리 문자열. `drawer`·`item`을 지우고 `date`는 남긴다. */
export function closeDrawerQuery(search: string): string {
  const params = paramsOf(search)
  params.delete(DRAWER_KEY)
  params.delete(ITEM_KEY)
  return params.toString()
}

/** 서랍을 여는 칸에 다는 값(`data-drawer-trigger`): `item:<키>` 또는 `day:<날짜>`. */
export function drawerTriggerValue(target: ScheduleDrawerTarget): string {
  return target.kind === 'item' ? `item:${target.key}` : `day:${target.date}`
}

/** 닫을 때 포커스를 돌려줄 칸을 찾는 선택자. 값 안의 따옴표·역슬래시는 버린다(키는 UUID·날짜뿐이라 정상 값은 그대로다). */
export function drawerTriggerSelector(target: ScheduleDrawerTarget): string {
  return `[data-drawer-trigger="${drawerTriggerValue(target).replace(/["\\]/g, '')}"]`
}
