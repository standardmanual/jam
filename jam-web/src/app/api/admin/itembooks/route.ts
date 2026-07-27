import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('item_books').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ itemBooks: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    name, description, image_url, required_activity_badge_id, reward_badge_id, faction_id,
    story_text, is_active, rarity_mode, uniform_rarity,
  } = body

  if (!name || !description || !required_activity_badge_id) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  if (rarity_mode && !['mixed', 'uniform'].includes(rarity_mode)) {
    return NextResponse.json({ error: 'rarity_mode는 mixed 또는 uniform이어야 합니다.' }, { status: 400 })
  }
  if (rarity_mode === 'uniform' && !uniform_rarity) {
    return NextResponse.json({ error: '동일한 등급 정책은 uniform_rarity 지정이 필요합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('item_books')
    .insert({
      name,
      description,
      image_url: image_url ?? null,
      required_activity_badge_id,
      reward_badge_id: reward_badge_id ?? null,
      faction_id: faction_id ?? null,
      story_text: story_text ?? null,
      is_active: is_active ?? true,
      rarity_mode: rarity_mode ?? 'mixed',
      uniform_rarity: rarity_mode === 'uniform' ? uniform_rarity : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ itemBook: data }, { status: 201 })
}
