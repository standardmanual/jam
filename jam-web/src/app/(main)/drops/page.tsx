import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DropsClient, { type DropsFocusPoi } from './DropsClient'

/**
 * 20260824_021: `?poi=<id>` — 알림 소식 #18·#32의 착지점.
 * 좌표는 서버에서 읽어 넘긴다(반경 밖 POI라 클라이언트의 `pois` 목록에 없을 수 있다).
 */
interface Props {
  searchParams: Promise<{ poi?: string }>
}

export default async function DropsPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { poi } = await searchParams
  let focusPoi: DropsFocusPoi | null = null
  if (poi) {
    // 잘못된 id(UUID가 아닌 값 포함)는 data=null로 떨어져 그냥 포커싱하지 않는다
    const { data } = await supabase
      .from('poi')
      .select('id, latitude, longitude')
      .eq('id', poi)
      .maybeSingle()
    if (data) focusPoi = data as DropsFocusPoi
  }

  return <DropsClient focusPoi={focusPoi} />
}
