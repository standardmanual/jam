import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const SLUG_RE = /^[a-z][a-z0-9_]*$/

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('poi_categories').select('*').order('slug')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { slug, label } = body

  if (!slug || !label) {
    return NextResponse.json({ error: 'slug, label은 필수입니다.' }, { status: 400 })
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'slug는 영문 소문자/숫자/밑줄만 가능하며 알파벳으로 시작해야 합니다. 예: fitness_center' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('poi_categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ slug, label } as any)
    .select()
    .single()

  if (error) {
    const message = error.code === '23505' ? '이미 존재하는 slug입니다.' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ category: data }, { status: 201 })
}
