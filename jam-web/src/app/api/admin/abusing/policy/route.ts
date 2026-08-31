import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  getAbusingPolicy,
  updateAbusingPolicy,
  DEFAULT_POLICY,
  RATE_KEYS,
  type AbusingPolicy,
} from '@/lib/abusing/policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await getAbusingPolicy()
  return NextResponse.json({ policy })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as Partial<AbusingPolicy>

  // 허용 키만 추출 + 숫자 검증.
  // body를 그대로 upsert에 넘기면 폼이 함께 보내는 id·updated_at이나 미지의 키 하나 때문에
  // 전체 저장이 롤백된다 (티켓 20260831_1149).
  const patch: Partial<AbusingPolicy> = {}
  for (const key of Object.keys(DEFAULT_POLICY) as (keyof AbusingPolicy)[]) {
    const v = body[key]
    if (v === undefined) continue
    const n = typeof v === 'string' ? parseFloat(v) : v
    if (typeof n !== 'number' || Number.isNaN(n) || n < 0) {
      return NextResponse.json(
        {
          error: `어뷰징 정책이 저장되지 않았어요. ${key} 값이 0 이상의 숫자가 아니에요. 값을 확인하고 다시 저장해 주세요.`,
        },
        { status: 400 }
      )
    }
    // rate 계열은 슬라이더 범위와 DB NUMERIC(3,2) 제약에 맞춰 0~1로 제한한다.
    // 임계값 계열(km/h·시간)에는 상한을 두지 않는다.
    if (RATE_KEYS.has(key) && n > 1) {
      return NextResponse.json(
        {
          error: `어뷰징 정책이 저장되지 않았어요. ${key} 값이 0~1 범위를 벗어났어요. 0~1 사이로 맞추고 다시 저장해 주세요.`,
        },
        { status: 400 }
      )
    }
    patch[key] = n
  }

  try {
    await updateAbusingPolicy(patch)
  } catch (e) {
    // 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        error: `어뷰징 정책이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. (${detail})`,
      },
      { status: 500 }
    )
  }

  // 저장 직후 DB에서 다시 읽어 돌려준다 — 폼이 실제 반영된 값으로 화면을 맞출 수 있다
  return NextResponse.json({ ok: true, policy: await getAbusingPolicy() })
}
