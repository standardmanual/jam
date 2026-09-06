/**
 * TTFB 진단 계측 라우트 — GET /api/diag-perf
 *
 * ⚠️ 폴더 이름에 `_` 접두사를 쓰지 않는다. App Router는 `_`로 시작하는 폴더를
 * **private folder**로 보아 라우팅에서 통째로 제외한다 — `/api/_perf`로 만들었더니
 * 404가 아니라 앱 HTML이 돌아와 한 번 헤맸다.
 *
 * 티켓 20260906_0940 ③(TTFB 3~5초)의 원인 구간을 특정하기 위한 **임시 계측기**다.
 * 밖에서 재는 것으로는 네트워크(75ms)·DB 실행(3ms)·콜드스타트·함수 기동(72ms)까지만
 * 배제할 수 있었고, 인증된 서버 경로 안의 ~700ms는 서버에서 직접 찍어야 나뉜다.
 *
 * ## 왜 CPU 시간을 함께 재는가 — 비용 판단이 여기에 걸린다
 *
 * Vercel Fluid compute는 **Active CPU와 대기 시간을 다른 단가로** 청구한다. 같은 700ms라도
 * CPU를 태운 700ms와 I/O를 기다린 700ms는 요금이 크게 다르다. `process.cpuUsage()`의
 * 구간 델타를 벽시계 시간과 나란히 찍으면 둘을 갈라낼 수 있다:
 *
 * - `cpuMs / wallMs`가 1에 가까우면 → CPU 바운드. 최적화가 곧 비용 절감이다
 * - 0에 가까우면 → I/O 대기. UX 문제는 맞지만 CPU 요금 영향은 작다
 *
 * ## 삭제 조건
 *
 * 원인을 특정하고 개선안이 정해지면 **지운다.** 남겨두려면 어드민 게이트를 붙여야 한다
 * (지금은 로그인만 요구한다 — 노출되는 것이 시각 수치뿐이라 진단 기간에는 이 수준으로 둔다).
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/** 모듈 로드 시각 — 이 인스턴스가 언제 기동했는지. 요청 시각과의 차이로 워밍 여부를 본다. */
const MODULE_LOADED_AT = Date.now()

export const dynamic = 'force-dynamic'

type Mark = { name: string; wallMs: number; cpuMs: number }

export async function GET() {
  const marks: Mark[] = []
  let lastWall = performance.now()
  let lastCpu = process.cpuUsage()

  /** 직전 마크 이후의 벽시계 시간과 CPU 시간을 함께 기록한다. */
  const mark = (name: string) => {
    const nowWall = performance.now()
    const cpu = process.cpuUsage(lastCpu)
    marks.push({
      name,
      wallMs: Math.round((nowWall - lastWall) * 100) / 100,
      // cpuUsage는 마이크로초 단위(user + system)
      cpuMs: Math.round(((cpu.user + cpu.system) / 1000) * 100) / 100,
    })
    lastWall = nowWall
    lastCpu = process.cpuUsage()
  }

  const startedWall = performance.now()
  const startedCpu = process.cpuUsage()

  // ① 익명 클라이언트 생성 (쿠키 읽기 포함, 네트워크 없음)
  const supabase = await createClient()
  mark('createClient')

  // ② 세션 검증 — Supabase Auth로 나가는 HTTPS 왕복
  const { data: { user } } = await supabase.auth.getUser()
  mark('auth.getUser')

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // ③ 서비스 클라이언트 생성 (네트워크 없음)
  const service = createServiceClient()
  mark('createServiceClient')

  // ④ 가벼운 DB 왕복 1회 — 실행 시간은 3ms 미만인 쿼리다. 여기 찍히는 건 사실상 왕복 비용.
  await service.from('users').select('id').eq('id', user.id).maybeSingle()
  mark('query#1')

  // ⑤ 같은 쿼리 한 번 더 — ④와 차이가 크면 커넥션·TLS 재사용이 첫 왕복에만 붙는다는 뜻이다.
  await service.from('users').select('id').eq('id', user.id).maybeSingle()
  mark('query#2')

  // ⑥ 두 번째 getUser — 레이아웃과 페이지가 각각 호출하는 상황의 실제 비용.
  //    ②와 비슷하면 매번 왕복이고, 훨씬 싸면 클라이언트 내부 캐시가 있다는 뜻이다.
  await supabase.auth.getUser()
  mark('auth.getUser#2')

  const totalWall = Math.round((performance.now() - startedWall) * 100) / 100
  const totalCpuRaw = process.cpuUsage(startedCpu)
  const totalCpu = Math.round(((totalCpuRaw.user + totalCpuRaw.system) / 1000) * 100) / 100

  return NextResponse.json({
    marks,
    totalWallMs: totalWall,
    totalCpuMs: totalCpu,
    /** 1에 가까우면 CPU 바운드, 0에 가까우면 I/O 대기 */
    cpuRatio: totalWall > 0 ? Math.round((totalCpu / totalWall) * 1000) / 1000 : null,
    /** 이 인스턴스가 기동한 뒤 흐른 시간(ms). 매 요청마다 0에 가까우면 인스턴스가 재사용되지 않는 것 */
    instanceAgeMs: Date.now() - MODULE_LOADED_AT,
    region: process.env.VERCEL_REGION ?? null,
  })
}
