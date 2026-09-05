'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconInfoCircle, IconLoader2 } from '@tabler/icons-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/admin/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { UNCLASSIFIED_SPORT, type BackfillOverview, type BackfillTargetUser } from '@/lib/strava/backfillStats'
import type { BackfillUserResult } from '@/lib/strava/backfill'

interface Props {
  overview: BackfillOverview | null
  loadError: string | null
}

interface RunState {
  apply: boolean
  result: BackfillUserResult | null
  logs: string[]
}

const numberFormat = (value: number) => value.toLocaleString('ko-KR')

/** 서버·클라이언트 렌더 결과가 갈리지 않도록 표시 시간대를 한국 표준시로 고정한다 */
function formatKst(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sportLabel(sport: string): string {
  if (sport === UNCLASSIFIED_SPORT) return UNCLASSIFIED_SPORT
  return ACTIVITY_TYPE_LABELS[sport] ?? sport
}

/** 「12건 (14%)」 형태. 분모가 0이면 비율을 붙이지 않는다 */
function withRatio(count: number, total: number): string {
  if (total <= 0) return `${numberFormat(count)}건`
  return `${numberFormat(count)}건 (${Math.round((count / total) * 100)}%)`
}

function userDisplayName(user: BackfillTargetUser): string {
  return user.username ?? user.email ?? user.userId
}

/**
 * Strava 확장 필드 백필 실행 화면 (티켓 20260905_1242)
 *
 * 유저 1명씩 «미리보기» → «적용» 2단계로 돌린다. 실행 뒤에는 응답에 실려 온 집계로 화면
 * 숫자를 통째로 갈아 끼운다 — 최초 렌더와 실행 직후가 같은 집계 함수를 쓰므로 두 숫자를
 * 그대로 비교할 수 있다.
 */
export default function StravaBackfillClient({ overview: initialOverview, loadError }: Props) {
  const [overview, setOverview] = useState(initialOverview)
  const [running, setRunning] = useState<{ userId: string; apply: boolean } | null>(null)
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const [error, setError] = useState<string | null>(null)

  async function run(userId: string, apply: boolean) {
    setRunning({ userId, apply })
    setError(null)
    try {
      const res = await fetch('/api/admin/strava-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, apply }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? '백필을 실행하지 못했습니다.')
        return
      }
      setRuns((prev) => ({
        ...prev,
        [userId]: { apply: json.apply === true, result: json.result ?? null, logs: json.logs ?? [] },
      }))
      if (json.overview) setOverview(json.overview as BackfillOverview)
    } catch (err) {
      setError(err instanceof Error ? err.message : '백필을 실행하지 못했습니다.')
    } finally {
      setRunning(null)
    }
  }

  const users = overview?.users ?? []
  const coverage = overview?.coverage ?? []

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strava 확장 필드 백필</h1>
        <p className="text-muted-foreground text-sm mt-1">
          이미 저장된 활동을 Strava 목록에서 다시 훑어 심박수·파워·케이던스 등 확장 필드만 채웁니다.
          한 번에 유저 한 명씩 실행합니다.
        </p>
      </div>

      <Alert>
        <IconAlertTriangle className="h-4 w-4" />
        <AlertTitle>미리보기도 완전한 읽기 전용은 아닙니다</AlertTitle>
        <AlertDescription>
          Strava를 호출하려면 유효한 토큰이 있어야 해서, 만료된 access_token은 미리보기에서도 갱신되고
          저장됩니다. Strava가 refresh_token을 회전시키기 때문에 저장하지 않으면 그 유저의 Strava
          동기화가 끊깁니다. 활동 데이터는 «적용»을 눌렀을 때만 바뀝니다.
        </AlertDescription>
      </Alert>

      <Alert>
        <IconInfoCircle className="h-4 w-4" />
        <AlertTitle>배지·아이템·미션·소식은 실행되지 않습니다</AlertTitle>
        <AlertDescription>
          백필은 활동의 확장 필드만 채웁니다. 배지 평가·아이템 드랍·미션 판정·소식 생성은 하나도
          일어나지 않고, 마지막 동기화 시각도 건드리지 않습니다. 같은 유저에게 여러 번 실행해도
          결과가 같습니다.
        </AlertDescription>
      </Alert>

      {loadError && (
        <Alert variant="destructive">
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle>현황을 불러오지 못했습니다</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle>백필을 실행하지 못했습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {overview?.truncated && (
        <Alert variant="destructive">
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle>활동이 집계 상한을 넘었습니다</AlertTitle>
          <AlertDescription>
            아래 숫자는 전체가 아니라 일부만 센 값입니다. 이 값을 근거로 배지 조건 임계값을 정하지
            마세요.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>대상 유저</CardTitle>
          <CardDescription>
            Strava 동기화를 한 유저 {numberFormat(users.length)}명. «미리보기»로 갱신 대상 건수를 먼저
            확인한 뒤 «적용»을 누르세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>유저</TableHead>
                <TableHead className="text-right">저장된 활동</TableHead>
                <TableHead className="text-right">확장 필드 보유</TableHead>
                <TableHead>마지막 백필</TableHead>
                <TableHead className="w-[220px]">실행</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Strava 동기화를 한 유저가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => {
                const runState = runs[user.userId]
                const isRunning = running?.userId === user.userId
                return (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div className="font-medium">{userDisplayName(user)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{user.userId}</div>
                      {runState && (
                        <div className="mt-2 text-xs">
                          <span className="font-semibold">
                            {runState.apply ? '적용 결과' : '미리보기 결과'}
                          </span>
                          {runState.result ? (
                            <span className="text-muted-foreground">
                              {' '}
                              — Strava {numberFormat(runState.result.fetched)}건 · 대조{' '}
                              {numberFormat(runState.result.matched)}건 · 갱신 대상{' '}
                              {numberFormat(runState.result.changed)}건 · 적용{' '}
                              {numberFormat(runState.result.updated)}건 · 요청{' '}
                              {numberFormat(runState.result.requests)}회
                              {runState.result.truncated && ' · 요청 예산이 떨어져 중간에 멈췄습니다'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground"> — 처리된 유저가 없습니다</span>
                          )}
                          {runState.result?.error && (
                            <div className="text-red-600 mt-1">오류: {runState.result.error}</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberFormat(user.activityCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {withRatio(user.extendedCount, user.activityCount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatKst(user.lastBackfilledAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={running !== null}
                          onClick={() => run(user.userId, false)}
                        >
                          {isRunning && running?.apply === false && (
                            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
                          )}
                          미리보기
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" disabled={running !== null}>
                              {isRunning && running?.apply === true && (
                                <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
                              )}
                              적용
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>이 유저의 활동에 확장 필드를 채울까요?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {userDisplayName(user)}님의 저장된 활동{' '}
                                {numberFormat(user.activityCount)}건에서 확장 필드만 채웁니다. 기존 값을
                                지우거나 덮어쓰지 않고, 배지·아이템·미션·소식도 실행되지 않습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction onClick={() => run(user.userId, true)}>
                                적용
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>종목별 커버리지</CardTitle>
          <CardDescription>
            집계 시각 {formatKst(overview?.measuredAt ?? null)} · 백필 대상 활동{' '}
            {numberFormat(overview?.totals.activityCount ?? 0)}건 중 확장 필드 보유{' '}
            {withRatio(overview?.totals.extendedCount ?? 0, overview?.totals.activityCount ?? 0)}
            {(overview?.orphaned.activityCount ?? 0) > 0 && (
              <>
                {' · '}Strava 연결이 없는 유저 {numberFormat(overview?.orphaned.userCount ?? 0)}명의 활동{' '}
                {numberFormat(overview?.orphaned.activityCount ?? 0)}건은 채울 수 없어 분모에서
                뺐습니다
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <IconAlertTriangle className="h-4 w-4" />
            <AlertTitle>케이던스 원값의 단위를 먼저 확인하세요</AlertTitle>
            <AlertDescription>
              달리기 케이던스 중앙값이 90 근처면 한쪽 발 기준이고, 180 근처면 양발 합계(spm)입니다.
              어느 쪽인지 확인하지 않고 배지 조건 임계값을 정하면 영영 획득되지 않는 배지가 만들어집니다.
              자전거는 rpm이라 애초에 다른 축입니다.
            </AlertDescription>
          </Alert>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>종목</TableHead>
                <TableHead className="text-right">활동</TableHead>
                <TableHead className="text-right">확장 필드 보유</TableHead>
                <TableHead className="text-right">평균 심박수</TableHead>
                <TableHead className="text-right">평균 파워</TableHead>
                <TableHead className="text-right">실측 파워</TableHead>
                <TableHead className="text-right">평균 케이던스</TableHead>
                <TableHead className="text-right">케이던스 중앙값</TableHead>
                <TableHead className="text-right">케이던스 범위</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverage.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    집계할 활동이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {coverage.map((row) => (
                <TableRow key={row.sport}>
                  <TableCell className="font-medium">{sportLabel(row.sport)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numberFormat(row.activityCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {withRatio(row.extendedCount, row.activityCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {withRatio(row.avgHeartrateBpmCount, row.activityCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {withRatio(row.avgWattsCount, row.activityCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {withRatio(row.deviceWattsTrueCount, row.activityCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {withRatio(row.avgCadenceCount, row.activityCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {row.avgCadenceMedian ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.avgCadenceMin === null || row.avgCadenceMax === null
                      ? '—'
                      : `${row.avgCadenceMin} ~ ${row.avgCadenceMax}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
