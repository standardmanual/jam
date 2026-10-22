import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  updateAbusingPolicy,
  MIN_VEHICLE_SPEED_FILTER_KMH,
  type AbusingPolicy,
} from '@/lib/abusing/policy'
import { updateCombinePolicy } from '@/lib/combine/policy'
import { updateInventoryMaxSlots } from '@/lib/inventory/policy'
import { updateAmbientDropConfig } from '@/lib/ambient-drop/config'
import { VALIDATORS as JAM_VALIDATORS, type JamPolicy } from '@/lib/jam/policy'

interface UpdateFieldBody {
  target: string
  field: string
  value: number
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: UpdateFieldBody
  try {
    body = (await req.json()) as UpdateFieldBody
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식이에요.' }, { status: 400 })
  }

  const { target, field, value } = body
  if (!target || !field || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
    return NextResponse.json({ error: '대상, 항목, 유효한 숫자 값이 필요해요.' }, { status: 400 })
  }

  try {
    if (target === 'abusing_policy') {
      if (field === 'vehicle_speed_filter_kmh' && value < MIN_VEHICLE_SPEED_FILTER_KMH) {
        return NextResponse.json(
          {
            error: `차량 속도 필터는 ${MIN_VEHICLE_SPEED_FILTER_KMH}km/h 이상이어야 해요. 20km/h 미만으로 내리면 자전거와 달리기 활동까지 걸러져요.`,
          },
          { status: 400 }
        )
      }
      if (value < 0) {
        return NextResponse.json({ error: '0 이상의 값을 입력해 주세요.' }, { status: 400 })
      }
      await updateAbusingPolicy({ [field]: value } as Partial<AbusingPolicy>)
      return NextResponse.json({ ok: true, target, field, value })
    }

    if (target === 'jam_policy') {
      const validator = JAM_VALIDATORS[field as keyof JamPolicy]
      if (validator && !validator(value)) {
        return NextResponse.json(
          { error: `${field} 항목의 유효 범위에 맞지 않는 값이에요.` },
          { status: 400 }
        )
      }
      const service = createServiceClient()
      const updatePayload: Record<string, unknown> = {
        [field]: value,
        updated_at: new Date().toISOString(),
      }
      const { error } = await service
        .from('jam_policy')
        .update(updatePayload as never)
        .eq('id', 1)

      if (error) {
        return NextResponse.json(
          { error: `잼 정책 저장에 실패했어요. (${error.message})` },
          { status: 500 }
        )
      }
      return NextResponse.json({ ok: true, target, field, value })
    }

    if (target === 'inventory_policy') {
      if (!Number.isInteger(value) || value < 1) {
        return NextResponse.json(
          { error: '인벤토리 최대 슬롯은 1 이상의 정수여야 해요.' },
          { status: 400 }
        )
      }
      await updateInventoryMaxSlots(value)
      return NextResponse.json({ ok: true, target, field, value })
    }

    if (target === 'combine_policy') {
      if (!Number.isInteger(value) || value < 0) {
        return NextResponse.json(
          { error: '믹스 보상 포인트는 0 이상의 정수여야 해요.' },
          { status: 400 }
        )
      }
      await updateCombinePolicy({ [field]: value })
      return NextResponse.json({ ok: true, target, field, value })
    }

    if (target === 'ambient_drop_config') {
      if (field === 'schedule_hour_kst' && (!Number.isInteger(value) || value < 0 || value > 23)) {
        return NextResponse.json(
          { error: '자동 배포 시각은 0시부터 23시 사이의 정수여야 해요.' },
          { status: 400 }
        )
      }
      if (field === 'exclusion_window_minutes' && (value < 0 || value > 720)) {
        return NextResponse.json(
          { error: '배제 창 시간은 0분 이상 720분 이하여야 해요.' },
          { status: 400 }
        )
      }
      if (field === 'max_active_per_poi' && (!Number.isInteger(value) || value < 1)) {
        return NextResponse.json(
          { error: '장소당 최대 활성 아이템 수는 1개 이상이어야 해요.' },
          { status: 400 }
        )
      }
      await updateAmbientDropConfig({ [field]: value })
      return NextResponse.json({ ok: true, target, field, value })
    }

    return NextResponse.json({ error: `알 수 없는 정책 대상이에요: ${target}` }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `정책 값을 저장하지 못했어요. (${message})` },
      { status: 500 }
    )
  }
}
