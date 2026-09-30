/**
 * POST /api/admin/ops-inbox — 운영 묶음 제출 (티켓 20260930_1816)
 *
 * 에이전트가 읽기 토큰(`x-admin-read-token`)으로 한 주치 운영 묶음을 낸다. 토큰의 쓰기가 열리는 **유일한
 * 경로**다(경로·메서드는 `opsInbox/constants.ts` 상수 하나를 proxy와 이 라우트가 함께 쓴다). 관리자 로그인
 * 세션으로도 낼 수 있다.
 *
 * 흐름: ① 인증 → ② 본문 1MB 확인 → ③ JSON 파싱 → ④ 필수 형식 검증(fatal이면 400) → ⑤ 최근 1시간 제출 수 확인(429)
 *  → ⑥ 같은 bundle_id 확인(같은 내용 200 / 다른 내용 409) → ⑦ 묶음·항목·결정 기록 저장(실패하면 묶음을 지워 되돌림)
 *  → ⑧ 201 → ⑨ 응답 뒤 슬랙 도착 글 게시(실패해도 제출은 성공, 결과는 결정 기록에 남긴다).
 *
 * 시간당 제출 수는 서버 인스턴스별 메모리가 아니라 DB(`ops_bundles.received_at`)로 센다.
 */
import { NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { requireOpsInboxSubmit } from '@/lib/admin/opsInbox/auth'
import {
  MAX_BODY_BYTES,
  MAX_SUBMISSIONS_PER_HOUR,
  OPS_DECISION_ACTION_SUBMIT,
  OPS_ITEM_INITIAL_STATUS,
} from '@/lib/admin/opsInbox/constants'
import { computeRawHash } from '@/lib/admin/opsInbox/rawHash'
import { formatArrivalMessage, postOpsSlack } from '@/lib/admin/opsInbox/slack'
import { validateOpsBundle } from '@/lib/admin/opsInbox/validate'

const ONE_HOUR_MS = 60 * 60 * 1000
const UNIQUE_VIOLATION = '23505'

type ServiceClient = ReturnType<typeof createServiceClient>

interface SubmitSummary {
  id: string
  bundle_id: string
  item_count: number
  format_errors: string[]
}

function badRequest(error: string, details?: string[]) {
  return NextResponse.json(details ? { error, details } : { error }, { status: 400 })
}

function serverError() {
  return NextResponse.json({ error: '저장하지 못했어요. 잠시 뒤에 다시 보내 주세요.' }, { status: 500 })
}

/** 같은 bundle_id가 이미 있을 때: 내용이 같으면 200(이미 받음), 다르면 409(덮어쓰지 않음). */
function respondToExisting(existing: { id: string; raw_hash: string }, rawHash: string, summary: Omit<SubmitSummary, 'id'>) {
  if (existing.raw_hash === rawHash) {
    return NextResponse.json(
      { status: 'duplicate', message: '이미 받았어요.', id: existing.id, ...summary },
      { status: 200 }
    )
  }
  return NextResponse.json(
    {
      error:
        '같은 bundle_id로 이미 다른 내용이 제출돼 있어요. 기존 묶음은 바꾸지 않았어요. 고친 내용을 보내려면 새 bundle_id를 써 주세요.',
      id: existing.id,
      bundle_id: summary.bundle_id,
    },
    { status: 409 }
  )
}

async function findBundleByBundleId(service: ServiceClient, bundleId: string) {
  return service.from('ops_bundles').select('id, raw_hash').eq('bundle_id', bundleId).maybeSingle()
}

/** 저장 중간에 실패했을 때 넣어 둔 묶음을 지운다(항목·결정 기록은 ON DELETE CASCADE). */
async function rollbackBundle(service: ServiceClient, id: string) {
  const { error } = await service.from('ops_bundles').delete().eq('id', id)
  if (error) console.error('[ops-inbox] 되돌림 실패(묶음이 남아 있을 수 있어요):', id, error.message)
}

export async function POST(req: Request) {
  // ① 인증
  const auth = await requireOpsInboxSubmit(req)
  if (!auth.ok) return auth.response

  // ② 본문 크기
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return badRequest('본문이 너무 커요. 제출 본문은 1MB까지 받아요. 항목을 줄여서 다시 보내 주세요.')
  }

  // ③ JSON 파싱
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 올바른 JSON인지 확인하고 다시 보내 주세요.')
  }

  // ④ 필수 형식(fatal). 그 밖의 형식 오류는 저장하고 돌려준다.
  const validation = validateOpsBundle(parsed)
  if (validation.fatal.length > 0 || !validation.bundle) {
    return badRequest('제출 본문의 필수 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', validation.fatal)
  }
  const { bundle, items, errors } = validation
  const actor = auth.via === 'token' ? `token:${bundle.author}` : auth.adminId
  const rawHash = computeRawHash(parsed)
  const summary = { bundle_id: bundle.bundle_id, item_count: items.length, format_errors: errors }

  const service = createServiceClient()

  // ⑤ 최근 1시간 제출 수
  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString()
  const { count, error: countError } = await service
    .from('ops_bundles')
    .select('id', { count: 'exact', head: true })
    .gte('received_at', since)
  if (countError) {
    console.error('[ops-inbox] 제출 수 조회 실패:', countError.message)
    return serverError()
  }
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_HOUR) {
    return NextResponse.json(
      { error: `최근 1시간 동안 받을 수 있는 제출 수(${MAX_SUBMISSIONS_PER_HOUR}회)를 넘었어요. 잠시 뒤에 다시 보내 주세요.` },
      { status: 429 }
    )
  }

  // ⑥ 같은 bundle_id
  const found = await findBundleByBundleId(service, bundle.bundle_id)
  if (found.error) {
    console.error('[ops-inbox] 묶음 조회 실패:', found.error.message)
    return serverError()
  }
  if (found.data) return respondToExisting(found.data, rawHash, summary)

  // ⑦ 묶음 → 항목 → 결정 기록
  const inserted = await service
    .from('ops_bundles')
    .insert({
      bundle_id: bundle.bundle_id,
      week: bundle.week,
      hypothesis: bundle.hypothesis,
      author: bundle.author,
      routine_run: bundle.routine_run,
      color_rationale_link: bundle.color_rationale_link,
      is_sample: bundle.is_sample,
      raw: parsed as Json,
      raw_hash: rawHash,
      format_errors: errors,
    })
    .select('id')
    .single()

  if (inserted.error || !inserted.data) {
    // 동시 제출: 같은 bundle_id를 다른 요청이 먼저 넣었다. ⑥과 같이 처리한다.
    if (inserted.error?.code === UNIQUE_VIOLATION) {
      const again = await findBundleByBundleId(service, bundle.bundle_id)
      if (again.data) return respondToExisting(again.data, rawHash, summary)
    }
    console.error('[ops-inbox] 묶음 저장 실패:', inserted.error?.message)
    return serverError()
  }
  const bundleDbId = inserted.data.id

  if (items.length > 0) {
    const { error: itemsError } = await service.from('ops_bundle_items').insert(
      items.map((item) => ({
        bundle_id: bundleDbId,
        position: item.position,
        item_key: item.item_key,
        kind: item.kind,
        pattern_no: item.pattern_no,
        starts_at: item.starts_at,
        ends_at: item.ends_at,
        status: OPS_ITEM_INITIAL_STATUS,
        original: item.original,
        format_errors: item.format_errors,
      }))
    )
    if (itemsError) {
      console.error('[ops-inbox] 항목 저장 실패:', itemsError.message)
      await rollbackBundle(service, bundleDbId)
      return serverError()
    }
  }

  const decision = await service
    .from('ops_decisions')
    .insert({ bundle_id: bundleDbId, action: OPS_DECISION_ACTION_SUBMIT, actor })
    .select('id')
    .single()
  if (decision.error || !decision.data) {
    console.error('[ops-inbox] 결정 기록 저장 실패:', decision.error?.message)
    await rollbackBundle(service, bundleDbId)
    return serverError()
  }
  const decisionId = decision.data.id

  // ⑨ 응답 뒤 슬랙 도착 글. 실패해도 제출은 성공이고, 결과는 결정 기록에 남긴다.
  after(async () => {
    try {
      const result = await postOpsSlack(
        'report',
        formatArrivalMessage({
          author: bundle.author,
          week: bundle.week,
          itemCount: items.length,
          formatErrorCount: errors.length,
          isSample: bundle.is_sample,
        })
      )
      if (!result.ok) console.error('[ops-inbox] 슬랙 알림 실패:', result.error)
      const slackResult: Json = result.error
        ? { channel: 'report', ok: result.ok, error: result.error }
        : { channel: 'report', ok: result.ok }
      const { error } = await service.from('ops_decisions').update({ slack_result: slackResult }).eq('id', decisionId)
      if (error) console.error('[ops-inbox] 알림 결과 기록 실패:', error.message)
    } catch (err) {
      console.error('[ops-inbox] 슬랙 알림 처리 중 예외:', err instanceof Error ? err.name : 'unknown')
    }
  })

  // ⑧ 201
  return NextResponse.json(
    { status: 'created', id: bundleDbId, bundle_id: bundle.bundle_id, item_count: items.length, format_errors: errors },
    { status: 201 }
  )
}
