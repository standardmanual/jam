import { OpsSampleBusy, OpsSampleScope, OpsSampleSwitch } from '@/components/admin/ops/OpsSampleSwitch'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { OpsTrendRadar } from '@/components/admin/ops/trends/OpsTrendRadar'
import { OpsTrendSources } from '@/components/admin/ops/trends/OpsTrendSources'
import { readIncludeSample } from '@/lib/admin/opsHome/links'
import { collectRadar } from '@/lib/admin/opsTrends/radar'
import { loadTrendRadarInput } from '@/lib/admin/opsTrends/radarLoad'
import { listTrendSources } from '@/lib/admin/opsTrends/sourceStore'
import { logQueryError } from '@/lib/admin/queryError'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 트렌드 레이더 (`/admin/ops-trends`, 티켓 20261026_2033 2회차, 어드민 상황판 PRD §6.4).
 *
 * 머리(제목·부제·시험 묶음 스위치) → 「내가 등록한 출처」(출처 표·추가·켜기/끄기) → 「읽은 트렌드」(최근 14일 레이더).
 * 출처와 묶음을 **따로 읽고**(`Promise.all`) 한쪽을 못 읽으면 그 구역만 안내 카드로 바꾼다 — 실패를 빈 상태로 보이지 않는다.
 * 출처를 못 읽어도 레이더는 그려지고(출처 칩이 「출처 N」만 보인다), 레이더를 못 읽어도 출처는 고칠 수 있다.
 * 시험 묶음 포함은 `?sample=1` 하나다(운영 홈·일정표와 같은 스위치). 이 화면은 캐시하지 않는다(지금 상태를 보는 화면).
 *
 * 읽기는 `try/catch`로 감싸고 JSX는 그 밖에서 만든다(`react-hooks/error-boundaries`가 `try` 안의 JSX를 막는다).
 */

const PAGE_TITLE = '트렌드 레이더'
const PAGE_SUBTITLE = '루틴이 읽을 출처를 등록하고, 읽은 트렌드가 어떻게 쓰였는지 봐요'
const SOURCES_TITLE = '내가 등록한 출처'
const RADAR_TITLE = '읽은 트렌드'
const RADAR_HINT = '최근 14일에 받은 기획에서 읽은 트렌드예요'
const TREND_SOURCES_LOAD_FAILED = '등록한 출처를 불러오지 못했어요'
const TREND_RADAR_LOAD_FAILED = '읽은 트렌드를 불러오지 못했어요'

type Settled<T> = { ok: true; value: T } | { ok: false }

async function settle<T>(label: string, read: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() }
  } catch (error) {
    logQueryError({ message: error instanceof Error ? error.message : String(error) }, `ops-trends/${label}`)
    return { ok: false }
  }
}

export default async function OpsTrendsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const includeSample = readIncludeSample(pickSingleQueryParams(await searchParams))
  const service = createServiceClient()
  const now = new Date()

  const [sources, bundles] = await Promise.all([
    settle('sources', () => listTrendSources(service, { includeDisabled: true })),
    settle('radar', () => loadTrendRadarInput(service, { now, includeSample })),
  ])

  const radar = bundles.ok ? collectRadar({ bundles: bundles.value, now, includeSample }) : null
  const sourceNames = new Map<number, string>(sources.ok ? sources.value.map((source) => [source.no, source.name]) : [])

  return (
    <OpsSampleScope>
      <div className="p-8">
        <div className="max-w-6xl">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">{PAGE_TITLE}</h1>
              <p className="mt-1 text-sm text-muted-foreground break-keep wrap-break-word text-pretty">{PAGE_SUBTITLE}</p>
            </div>
            <OpsSampleSwitch includeSample={includeSample} />
          </header>

          <OpsSampleBusy className="space-y-8">
            <section aria-labelledby="trend-sources-heading" className="space-y-3">
              <h2 id="trend-sources-heading" className="text-lg font-semibold">
                {SOURCES_TITLE}
              </h2>
              {sources.ok ? (
                <OpsTrendSources
                  sources={sources.value.map(({ id, no, name, kind, location, enabled, lastReadAt }) => ({
                    id,
                    no,
                    name,
                    kind,
                    location,
                    enabled,
                    lastReadAt,
                  }))}
                />
              ) : (
                <OpsSectionNotice icon="trend" title={TREND_SOURCES_LOAD_FAILED} />
              )}
            </section>

            <section aria-labelledby="trend-radar-heading" className="space-y-3">
              <div>
                <h2 id="trend-radar-heading" className="text-lg font-semibold">
                  {RADAR_TITLE}
                </h2>
                <p className="text-sm text-muted-foreground break-keep wrap-break-word">{RADAR_HINT}</p>
              </div>
              {radar ? (
                <OpsTrendRadar
                  entries={radar.entries}
                  summary={radar.summary}
                  sourceNames={sourceNames}
                  includeSample={includeSample}
                />
              ) : (
                <OpsSectionNotice icon="trend" title={TREND_RADAR_LOAD_FAILED} />
              )}
            </section>
          </OpsSampleBusy>
        </div>
      </div>
    </OpsSampleScope>
  )
}
