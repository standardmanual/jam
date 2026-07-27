import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const { label } = await req.json()
  if (!label) return NextResponse.json({ error: 'label은 필수입니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('poi_categories')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ label })
    .eq('slug', slug)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const supabase = createServiceClient()

  const { count } = await supabase
    .from('poi')
    .select('*', { count: 'exact', head: true })
    .eq('category', slug)
  if (count && count > 0) {
    return NextResponse.json(
      { error: `이 카테고리를 사용 중인 POI가 ${count}개 있어 삭제할 수 없습니다.` },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('poi_categories').delete().eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
