/**
 * 정책 대시보드와 생태계 상황판이 함께 쓰는 정책 실시간 설정값 읽기 (티켓 20261026_2027 3-1). 서버에서만 쓴다.
 *
 * 설정값 여섯 묶음을 따로 읽고(`Promise.allSettled`) 읽은 것만 한 객체로 합친다. 한 묶음이 실패해도 던지지 않고
 * 그 묶음의 값만 빠진다(정책 카드는 값이 없으면 «읽지 못함» 쪽으로 보인다).
 */
import { getJamPolicy } from '@/lib/jam/policy'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { getCombinePolicy } from '@/lib/combine/policy'
import { getInventoryPolicy } from '@/lib/inventory/policy'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { getCapsulePolicy } from '@/lib/capsule/policy'

export async function loadPolicyLiveValues(): Promise<Record<string, unknown>> {
  const [jamRes, abusingRes, combineRes, inventoryRes, ambientRes, capsuleRes] =
    await Promise.allSettled([
      getJamPolicy(),
      getAbusingPolicy(),
      getCombinePolicy(),
      getInventoryPolicy(),
      getAmbientDropConfig(),
      getCapsulePolicy(),
    ])

  return {
    ...(jamRes.status === 'fulfilled' ? jamRes.value : {}),
    ...(abusingRes.status === 'fulfilled' ? abusingRes.value : {}),
    ...(combineRes.status === 'fulfilled' ? combineRes.value : {}),
    ...(inventoryRes.status === 'fulfilled' ? inventoryRes.value : {}),
    ...(ambientRes.status === 'fulfilled' ? ambientRes.value : {}),
    ...(capsuleRes.status === 'fulfilled' ? capsuleRes.value : {}),
  }
}
