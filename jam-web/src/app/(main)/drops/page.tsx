import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DropsClient, { type DropsFocusPoi } from './DropsClient'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'

/**
 * 20260824_021: `?poi=<id>` — 알림 소식 #18·#32의 착지점.
 * 좌표는 서버에서 읽어 넘긴다(반경 밖 POI라 클라이언트의 `pois` 목록에 없을 수 있다).
 *
 * ⚠️ `poi`의 타입을 `string`으로 좁히지 말 것 — `?poi=1&poi=2`처럼 같은 키가 두 번 오면
 * Next가 배열을 넘긴다. 지금은 그 값이 DB 조회로 흘러가 `data=null`이 되어 포커싱만 안 되지만,
 * 선언이 사실과 어긋난 채 버티는 것뿐이다 — 여기서 정규화해 「값 없음」(= 포커싱 없음)으로
 * 못 박는다 (티켓 20260906_1312).
 */
interface Props {
  searchParams: Promise<{ poi?: SearchParamValue }>
}

export default async function DropsPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const poi = singleQueryParam((await searchParams).poi)
  let focusPoi: DropsFocusPoi | null = null
  if (poi) {
    // 잘못된 id(UUID가 아닌 값 포함)는 data=null로 떨어져 그냥 포커싱하지 않는다.
    // 20260830_1620: is_active=false인 지점은 /api/drops 응답에서 이미 마커가 빠지므로
    // 좌표만 받아 포커싱해봐야 빈 자리를 가리키게 된다 — 여기서도 같은 조건으로 제외한다.
    const { data } = await supabase
      .from('poi')
      .select('id, latitude, longitude')
      .eq('id', poi)
      .eq('is_active', true)
      .maybeSingle()
    if (data) focusPoi = data as DropsFocusPoi
  }

  return <DropsClient focusPoi={focusPoi} />
}
