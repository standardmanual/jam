/**
 * 밸런스 지표 카드 하나 (티켓 20261022_1136 1회 b, 운영 로직 19.2절)
 *
 * 칸(`MetricPart`)마다 목표와 현재값을 한 줄에 같이 보인다.
 *
 * - **부족(`insufficient`)이면 숫자 없이 «아직 데이터가 부족해요»만 보인다.** 목표는 그대로 보이고, 표본 수나 모의 실험 추정값은 보이지 않는다
 *   (0이나 100%로 읽히면 «하나도 못 받았다», «전원 가득 찼다»로 오해해서다. 관찰이 충분한데 실제로 0건인 것은 `ready`의 값 0으로 따로 보인다).
 * - 읽기 오류(`error`)는 지표 단위 오류 카드다. 문장은 읽기 쪽이 정한 고정 문장이고 DB 오류 원문은 싣지 않는다.
 * - 목표가 없는 칸(챕터 2~9의 열기 속도)은 «목표 없음»이고 목표와 견주지 않는다.
 *
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다. 목표와 값의 견줌(`compareToTarget`)과 글자 만들기는 시험하려고 내보낸다.
 */
import { Alert } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { compareToTarget, DISPLAY_DIGITS, type TargetFit } from '@/lib/admin/balanceDashboard/fit'
import { METRIC_SPECS, partSpec } from '@/lib/admin/balanceDashboard/targets'
import type {
  Measurement,
  MetricPart,
  MetricPartSpec,
  MetricResult,
  SampleUnit,
  ValueUnit,
} from '@/lib/admin/balanceDashboard/types'
import { AdjustLinks } from './AdjustLinks'

export const INSUFFICIENT_TEXT = '아직 데이터가 부족해요'
export const NO_TARGET_TEXT = '목표 없음'

/** 견줌은 `lib/admin/balanceDashboard/fit.ts`로 옮겼다(티켓 20261026_2027). 기존 import 경로가 그대로 통하게 다시 내보낸다 */
export { compareToTarget, type TargetFit }

function trimmed(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)))
}

/** 측정값을 단위와 함께 글자로 만든다. 비율은 퍼센트, 소수는 필요한 자리까지만 쓴다 */
export function formatMeasuredValue(unit: ValueUnit, value: number): string {
  switch (unit) {
    case 'per_week':
      return `주 ${trimmed(value, DISPLAY_DIGITS.per_week)}번`
    case 'per_month':
      return `한 달 ${trimmed(value, DISPLAY_DIGITS.per_month)}번`
    case 'count_30d':
      return `${trimmed(value, DISPLAY_DIGITS.count_30d)}개`
    case 'ratio':
      return `${trimmed(value * 100, 1)}%`
  }
}

/** 값을 낸 표본이 어떤 단위였는지 글자로 만든다. 등급 체감은 유저가 관찰된 기간을 합친 노출량이다 */
export function formatSample(sampleUnit: SampleUnit, sample: number): string {
  switch (sampleUnit) {
    case 'user':
      return `${trimmed(sample, 0)}명 기준`
    case 'user_week':
      return `유저 합계 ${trimmed(sample, 1)}주 기준`
    case 'user_month':
      return `유저 합계 ${trimmed(sample, 1)}달 기준`
  }
}

const FIT_LABEL: Record<TargetFit, string> = {
  below: '목표보다 낮아요',
  within: '목표 안이에요',
  above: '목표보다 높아요',
}

function CurrentCell({ spec, measurement }: { spec: MetricPartSpec; measurement: Measurement }) {
  if (measurement.status === 'insufficient') {
    return (
      <p data-measurement="insufficient" className="text-muted-foreground break-keep wrap-break-word">
        {INSUFFICIENT_TEXT}
      </p>
    )
  }
  const fit = spec.target ? compareToTarget(spec.unit, measurement.value, spec.target) : null
  return (
    <div data-measurement="ready" className="space-y-1">
      <p className="font-medium tabular-nums break-keep wrap-break-word">{formatMeasuredValue(spec.unit, measurement.value)}</p>
      <p className="text-xs text-muted-foreground break-keep wrap-break-word">
        {formatSample(measurement.sampleUnit, measurement.sample)}
      </p>
      {fit && (
        <Badge variant={fit === 'within' ? 'secondary' : 'default'} data-fit={fit} className="whitespace-nowrap break-keep">
          {FIT_LABEL[fit]}
        </Badge>
      )}
    </div>
  )
}

function PartRow({ spec, part }: { spec: MetricPartSpec; part: MetricPart }) {
  return (
    <TableRow data-part={spec.id}>
      <TableCell className="align-top font-medium break-keep wrap-break-word">{spec.label}</TableCell>
      <TableCell className="align-top break-keep wrap-break-word">
        {spec.target ? spec.target.text : <span className="text-muted-foreground">{NO_TARGET_TEXT}</span>}
      </TableCell>
      <TableCell className="align-top">
        <CurrentCell spec={spec} measurement={part.measurement} />
      </TableCell>
    </TableRow>
  )
}

export interface MetricCardProps {
  result: MetricResult
  /** 구역 키 → 구역 이름. «바로 조정» 링크가 쓴다 */
  sectionLabels: Readonly<Record<string, string>>
}

export function MetricCard({ result, sectionLabels }: MetricCardProps) {
  const metric = METRIC_SPECS[result.key]
  return (
    <Card data-metric={result.key} data-status={result.status} className="min-w-0">
      <CardHeader>
        <CardTitle role="heading" aria-level={2} className="text-lg leading-snug text-balance break-keep wrap-break-word">
          {metric.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.status === 'error' ? (
          <Alert variant="destructive">
            <p className="text-sm break-keep wrap-break-word">{result.message}</p>
          </Alert>
        ) : (
          <>
            <Table aria-label={`${metric.title}의 목표와 현재값`}>
              <TableHeader>
                <TableRow>
                  <TableHead className="break-keep wrap-break-word">구분</TableHead>
                  <TableHead className="break-keep wrap-break-word">목표</TableHead>
                  <TableHead className="break-keep wrap-break-word">현재</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.parts.map((part) => (
                  <PartRow key={part.id} spec={partSpec(result.key, part.id)} part={part} />
                ))}
              </TableBody>
            </Table>
            <AdjustLinks targets={metric.adjust} sectionLabels={sectionLabels} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
