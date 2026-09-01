import type { CSSProperties } from 'react'
import { parseBlobAnimation, type BlobAnimationParams } from '@/lib/blobAnimation'

/**
 * 배경 테마 계산에 필요한 최소 필드 shape — 구조적 타입이라 이 4개 필드 이름만 맞으면 어떤 row든
 * (배지·컬렉션·세계관 등) 그대로 재사용할 수 있다. 특정 엔티티(`BadgeRow` 등)에서 `Pick`하지
 * 않는 이유는, `Pick`으로 만들면 타입이 그 엔티티에 종속된 것처럼 보여 호출부가 늘어날수록
 * 이름과 실제 쓰임(범용)이 어긋나기 때문이다 (20260819_014 — `item_books`도 이 계산기를
 * 재사용하며 일반화).
 *
 * `background_video_url`(20260819_012)은 optional이라 영상을 다루지 않는 기존 호출부(어드민
 * 미리보기 등)는 그대로 둬도 된다.
 */
export interface BackgroundThemeSource {
  background_color: string | null
  background_shader_id: string | null
  background_image_url: string | null
  background_video_url?: string | null
  /** 카드 안 블롭 애니메이션 파라미터(jsonb 원본). optional이라 기존 호출부는 그대로 둬도 된다. — [20260901_1944] */
  background_animation?: unknown
}

/** @deprecated `BackgroundThemeSource`를 쓴다. badge 전용이 아닌 범용 이름으로 정리(20260819_014).
 *  기존 호출부 회귀를 막기 위해 별칭으로 유지한다. */
export type BadgeBackgroundThemeSource = BackgroundThemeSource

/**
 * 배지 상세화면과 향후 획득 알림 중앙 모달이 공유하는 배경 테마 스타일 계산기.
 * (20260818_002에서 no-op 뼈대로 도입, 20260818_003에서 background_color 실제 렌더링 연결,
 * 20260819_008에서 background_image_url 우선 렌더링 추가)
 *
 * - `background_image_url`(배경 제너레이터로 구운 정적 PNG)이 있으면 최우선 — 배경 이미지로
 *   렌더링한다. `background_color`와 상호 배타적으로 저장되므로(어드민 저장 시점에 보장) 실무상
 *   둘 다 값이 있는 경우는 없지만, 방어적으로 이미지가 있으면 색상은 무시한다.
 * - 없으면 `background_color`가 있는 경우 해당 색을 배경색으로 반환한다.
 * - `background_shader_id`는 쉐이더 기술 스택(CSS vs WebGL)이 아직 미정([20260818_001] 보류
 *   항목)이라 이번 범위에서는 값이 있어도 항상 무시한다 — 어드민에서 선택·저장은 되지만
 *   렌더링에는 관여하지 않는다. 스택이 확정되면 이 함수 내부만 확장하면 된다(호출부 변경 불필요).
 */
export function getBadgeBackgroundStyle(badge: BackgroundThemeSource): CSSProperties {
  // [20260901_1944] 우선순위 `background_animation` > `background_image_url` > `background_color`.
  // 애니메이션이 켜져 있으면 배경 저작 모드가 "애니메이션"이라는 뜻이고, 그 애니메이션은 이미지
  // 카드 안에서만 그려진다. 이때 전체 배경 레이어까지 함께 칠하면 저작 화면에서 선택하지도 않은
  // 과거 값(구워둔 이미지·예전 배경색)이 화면 전체에 살아나므로 레이어를 비운다.
  //
  // 저장 시점에 background_image_url/background_color를 null로 덮지 않고 렌더링 단계에서
  // 우선순위로 해결하는 이유: 티켓 20260901_1929가 저장 payload에서 background_image_url/
  // background_video_url을 의도적으로 생략해 기존 DB 값을 보존하도록 바꿨다(제너레이터가 사라져
  // 다시 만들 방법이 없는 값이다). 여기서 파괴적 null 덮어쓰기를 되살리면 그 결정을 뒤집는 것이라,
  // 데이터는 보존하고 "무엇을 그릴지"만 이 한 곳에서 결정한다.
  if (parseBlobAnimation(badge.background_animation)) return {}
  if (badge.background_image_url) {
    // [20260819_011] 이 스타일은 이제 앱 컬럼 폭(430px) 고정 배경 레이어 "한 곳"에만 적용된다.
    // 저장된 이미지는 SERVICE_WIDTH(430px) 기준으로 구운 정사각형이고, 적용 대상 레이어는
    // 430px × 뷰포트 높이(세로로 2배 이상 긴 박스)라 크기 지정 방식을 다시 정했다(실제 렌더링
    // 3안 비교):
    // - `cover`: 세로를 채우느라 2배 이상 확대되고 좌우가 잘려 저작할 때 본 패턴 밀도와 달라진다.
    // - `100% 100%`: 잘리진 않지만 세로로만 2배 이상 늘어나 원이 타원이 되는 등 형태가 망가진다.
    // - `100% auto` + repeat(채택): 가로를 저작 폭 그대로(1:1) 두고 세로로 반복시킨다. 저작한
    //   크기·비율이 그대로 유지되고, 제너레이터 자체가 타일 반복 패턴을 굽는 도구라 반복이
    //   본래 의도에도 맞는다.
    // 어드민 미리보기도 같은 폭·비율 프레임에 동일한 규칙으로 그려 화면이 서로 어긋나지 않는다.
    return {
      backgroundImage: `url(${badge.background_image_url})`,
      backgroundSize: '100% auto',
      backgroundPosition: 'top center',
      backgroundRepeat: 'repeat',
    }
  }
  if (!badge.background_color) return {}
  return { backgroundColor: badge.background_color }
}

/**
 * 배경 테마(배경 이미지 또는 배경색)가 지정된 배지인지 판정한다. — [20260819_011]
 * 배경이 있으면 상세화면의 TopNav·Hero 카드는 고정 배경 레이어를 가리지 않도록 투명해지고,
 * 없으면 기존 그대로(--color-surface / bg-surface-elevated) 유지된다.
 *
 * [20260819_012] 영상 배경(background_video_url)도 배경 테마로 친다. 저장 시 poster용
 * background_image_url이 항상 함께 채워지므로 실무상 판정 결과가 달라지지는 않지만, 방어적으로
 * 영상만 남은 데이터에서도 투명 처리가 유지되도록 한다.
 */
export function hasBadgeBackgroundTheme(badge: BackgroundThemeSource): boolean {
  // [20260901_1944] 이 판정의 의미는 "고정 배경 레이어에 무언가 그려지는가"다. 애니메이션 모드는
  // 그 레이어를 비우고(getBadgeBackgroundStyle 참조) 이미지 카드 안에만 그리므로, TopNav·본문은
  // 배경이 없을 때와 동일하게(--color-surface / PAGE_BG) 남아야 한다 → false.
  if (parseBlobAnimation(badge.background_animation)) return false
  return Boolean(badge.background_image_url || badge.background_video_url || badge.background_color)
}

/**
 * 이미지 카드 안에서 실행할 배경 애니메이션 파라미터. 없거나 형식이 어긋나면 null. — [20260901_1944]
 *
 * 전체 배경 레이어(위 두 함수)와 렌더링 지점이 다르지만, "어떤 배경을 그릴 것인가"의 판단은
 * 한 곳(이 모듈)에 모아 호출부가 우선순위를 각자 해석하지 않도록 한다.
 */
export function getBadgeBackgroundAnimation(badge: BackgroundThemeSource): BlobAnimationParams | null {
  return parseBlobAnimation(badge.background_animation)
}

/**
 * 배경 레이어에서 실제로 재생할 반복 영상 URL. — [20260819_012]
 *
 * `getBadgeBackgroundStyle`은 CSS만 반환하는 순수 함수라 `<video>` 엘리먼트를 만들 수 없다.
 * 호출부가 늘어나지 않도록(배경은 티켓 20260819_011에서 확정한 단일 레이어 한 곳에서만 그린다)
 * "영상을 틀어야 하는가"의 판단만 이 함수로 한 곳에 모으고, 엘리먼트 생성은 그 단일 레이어가
 * 담당한다.
 *
 * 영상이 있어도 CSS 배경 이미지(poster)는 그대로 깔아 둔다 — 영상 로드 전 첫 페인트,
 * 로드 실패 폴백, `prefers-reduced-motion: reduce`(영상만 CSS로 숨김), 영상 높이(3타일)를
 * 넘어서는 초장신 뷰포트까지 모두 정지 이미지가 받아준다.
 */
export function getBadgeBackgroundVideoUrl(badge: BackgroundThemeSource): string | null {
  return badge.background_video_url ?? null
}

/**
 * 배경 위 흰 텍스트 가독성 보정용 텍스트 그림자. — [20260819_011에서 공통화]
 * 상세화면과 어드민 미리보기가 같은 값을 쓰도록 한 곳에서 계산한다. 배경이 없으면 빈 스타일이라
 * 기존 화면과 동일하다.
 */
export function getBadgeThemedTextStyle(themed: boolean): CSSProperties {
  return themed ? { textShadow: '0 1px 2px rgba(0,0,0,0.65), 0 1px 10px rgba(0,0,0,0.4)' } : {}
}
