import { createServiceClient } from '@/lib/supabase/server'

/**
 * 생성 이미지 -> 대상 레코드 이미지 컬럼 적용 공용 함수 (티켓 20260913_0414)
 *
 * `/api/admin/shader-text/generate`(배지 전용)가 확립한 "Storage 업로드 -> getPublicUrl() +
 * 캐시 무효화 쿼리 -> 대상 레코드 update" 흐름을 배지/미션/컬렉션(아이템북) 3종 신규 적용
 * 라우트가 공유하도록 뺐다. 기존 3개 생성 도구(activity-badge-image, badge-image, shader-text)는
 * 각자 인라인 구현을 그대로 유지한다 - 이 함수로 리팩터링하는 것은 이 티켓 범위 밖이다.
 *
 * 대상 테이블(badges/missions/item_books) 모두 id 컬럼이 id, 이미지 컬럼이 image_url로
 * 동일해 idColumn/imageColumn을 별도 매개변수로 받지 않는다. table만으로 갱신 대상이
 * 정해진다(다른 컬럼명을 쓰는 대상이 생기면 그때 매개변수화한다).
 */

export const APPLY_GENERATED_IMAGE_BUCKET = 'images'
export const MAX_APPLY_IMAGE_BYTES = 5 * 1024 * 1024

export type ApplyGeneratedImageTable = 'badges' | 'missions' | 'item_books'

export interface ApplyGeneratedImageParams {
  /** 대상 테이블. id/image_url 컬럼 이름이 세 테이블 모두 동일하다고 가정한다. */
  table: ApplyGeneratedImageTable
  /** 대상 레코드 id */
  id: string
  /** Storage 버킷(images) 안 경로. 예: badges/shader-lab/{id}.png */
  path: string
  png: Buffer
}

export type ApplyGeneratedImageOutcome =
  | { ok: true; imageUrl: string }
  | { ok: false; status: number; error: string }

/**
 * 세 테이블(badges/missions/item_books)의 Row/Update 타입이 서로 달라, 공용 함수 안에서
 * table 매개변수 하나로 update()를 호출하려면 최소 인터페이스로 좁게 캐스팅해야 한다
 * - poi-review.ts와 같은 기법이다(전체를 as any로 덮지 않고, 실제로 쓰는 컬럼만 담은
 * 인터페이스로 한정한다). column 타입은 리터럴('id') 대신 string으로 완화했다 - 항상
 * 'id' 하나로만 호출되므로 실질적 안전성 손실은 없다.
 */
interface ImageColumnUpdateClient {
  update: (values: { image_url: string }) => {
    eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>
  }
}

export async function applyGeneratedImage({
  table,
  id,
  path,
  png,
}: ApplyGeneratedImageParams): Promise<ApplyGeneratedImageOutcome> {
  const supabase = createServiceClient()

  const uploadContentType = `image/png`
  const { error: uploadErr } = await supabase.storage
    .from(APPLY_GENERATED_IMAGE_BUCKET)
    .upload(path, png, { contentType: uploadContentType, upsert: true })
  if (uploadErr) {
    return { ok: false, status: 500, error: `이미지 업로드 실패: ${uploadErr.message}` }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).getPublicUrl(path)
  const imageUrl = `${publicUrl}?v=${Date.now()}`

  const client = supabase.from(table) as unknown as ImageColumnUpdateClient
  const { error: updateErr } = await client.update({ image_url: imageUrl }).eq('id', id)
  if (updateErr) {
    return { ok: false, status: 500, error: `이미지는 업로드됐지만 반영에 실패했습니다: ${updateErr.message}` }
  }

  return { ok: true, imageUrl }
}
