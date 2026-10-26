/**
 * 밸런스 지표 (티켓 20261022_1136 1회 b·2회, 운영 로직 19.2절)
 *
 * 탭이 둘이다(`?tab=`, 기본은 지표).
 * - 지표: 캡슐을 여는 속도, 챕터 도달 속도, 한 달에 받는 아이템 배지, 등급 체감, 컬렉션 완성 속도, 인벤토리가 거의 가득 찬 유저의 비율을 목표와 함께 보인다.
 *   문제가 되는 수치는 카드의 «바로 조정»으로 밸런스 설정(`/admin/balance`)의 해당 구역에 가서 바꾼다(구역 단위 링크).
 * - 컬렉션별 획득 경로(`?tab=paths&page=`): 컬렉션마다 아이템 배지가 드랍·믹스·미션·동기화와 캡슐·등급 올리기 중 어느 길로 얻어지는지와 닫힌 길의 사유를 보인다.
 *   얻을 길이 없는 아이템 배지가 많은 컬렉션부터, 한 쪽에 10개다. 선택한 탭의 데이터만 읽는다.
 *
 * 서버 컴포넌트가 서비스 클라이언트로 읽기만 한다. **`loadBalanceDashboard`·`loadItemPathInputs`는 인가를 검사하지 않는다.** 이 화면은 `hasAdminAccess`를 거치는
 * `app/admin/layout.tsx` 아래에서만 부르고, 읽기용 API 라우트(토큰 포함)는 이 화면을 위해 만들지 않는다.
 * 지표 하나를 읽지 못하면 그 카드만 오류 카드가 되므로(`load.ts`) 구역별 `Suspense`를 두지 않는다. 획득 경로는 읽기 한 곳이라도 실패하면 부분 결과 없이 오류 카드 하나다
 * (읽지 못한 길을 «닫힘»으로 보이게 하지 않으려는 것이다).
 *
 * 요청마다 지금 시각으로 계산하므로 정적으로 굳지 않게 `force-dynamic`이다.
 */
import { BalanceDashboardTabs } from '@/components/admin/balanceDashboard/BalanceDashboardTabs'
import { BalanceDashboardView } from '@/components/admin/balanceDashboard/BalanceDashboardView'
import { CollectionPaths } from '@/components/admin/balanceDashboard/CollectionPaths'
import { Alert } from '@/components/admin/ui/alert'
import { BALANCE_SECTIONS } from '@/lib/admin/balance/sections'
import { loadBalanceDashboard } from '@/lib/admin/balanceDashboard/load'
import { computeItemPaths } from '@/lib/admin/itemPaths/compute'
import { ITEM_PATH_LOAD_FAILED_MESSAGE, loadItemPathInputs } from '@/lib/admin/itemPaths/load'
import { loadPathNames } from '@/lib/admin/itemPaths/loadPathNames'
import {
  buildCollectionPathViews,
  idsOnPage,
  parseDashboardTab,
  parsePageParam,
  pickCollectionPage,
} from '@/lib/admin/itemPaths/pathView'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: SearchParamsPromise
}

const METRICS_DESCRIPTION =
  '지표 여섯 개를 목표와 견줘 봐요. 목표는 기준 유저(러닝 보통)의 값이에요. 데이터가 모자란 지표는 값을 보이지 않아요. 문제가 되는 수치는 지표 아래 바로 조정에서 밸런스 설정의 해당 구역으로 가서 바꿔요.'
const PATHS_DESCRIPTION =
  '컬렉션마다 아이템 배지가 드랍, 믹스, 미션, 동기화와 캡슐, 등급 올리기 중 어느 길로 얻어지는지 봐요. 길이 모두 닫힌 아이템 배지는 막힘이에요.'

async function MetricsTab() {
  const data = await loadBalanceDashboard(createServiceClient(), new Date())
  const sectionLabels = Object.fromEntries(BALANCE_SECTIONS.map((section) => [section.binding.id, section.label]))
  return <BalanceDashboardView data={data} sectionLabels={sectionLabels} />
}

/** 이 쪽의 보기 모델을 읽는다. 어느 읽기든 실패하면 부분 결과 없이 null이다(원인은 서버 로그에만 남긴다) */
async function loadPathsView(requestedPage: number) {
  const supabase = createServiceClient()
  const now = new Date()
  try {
    const inputs = await loadItemPathInputs(supabase, now)
    const computed = computeItemPaths({ ...inputs, now })
    const pageInfo = pickCollectionPage(computed.collections, requestedPage)
    const ids = idsOnPage(computed, pageInfo.collectionIds)
    const names = await loadPathNames(supabase, ids)
    const views = buildCollectionPathViews(computed, pageInfo.collectionIds, names)
    return { views, pageInfo, generatedAt: now.toISOString() }
  } catch (error) {
    console.error('[admin/balance/dashboard] 컬렉션별 획득 경로 조회 실패:', error)
    return null
  }
}

async function PathsTab({ requestedPage }: { requestedPage: number }) {
  const loaded = await loadPathsView(requestedPage)
  if (loaded === null) {
    return (
      <Alert variant="destructive">
        <p className="break-keep wrap-break-word">{ITEM_PATH_LOAD_FAILED_MESSAGE}</p>
      </Alert>
    )
  }
  return <CollectionPaths views={loaded.views} pageInfo={loaded.pageInfo} generatedAt={loaded.generatedAt} />
}

export default async function BalanceDashboardPage({ searchParams }: Props) {
  const params = pickSingleQueryParams(await searchParams)
  const tab = parseDashboardTab(params.tab)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-balance break-keep wrap-break-word">밸런스 지표</h1>
        <p className="text-muted-foreground text-sm mt-1 text-pretty break-keep wrap-break-word">
          {tab === 'paths' ? PATHS_DESCRIPTION : METRICS_DESCRIPTION}
        </p>
      </div>

      <div className="mb-4">
        <BalanceDashboardTabs tab={tab} />
      </div>

      {tab === 'paths' ? <PathsTab requestedPage={parsePageParam(params.page)} /> : <MetricsTab />}
    </div>
  )
}
