export type Rarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface RarityBadgeProps {
  /**
   * 등급. `null`은 "등급이 존재하지 않음"(무한레벨형, v5 티켓 20260905_0027)을 뜻하며
   * 칩을 그리지 않는다 — `undefined`(미지정, 기본값 common으로 취급)와 의미가 다르다.
   *
   * 타입 밖의 값(오타·잘못된 캐스팅)은 **Common으로 폴백하지 않고** 아무것도 그리지
   * 않으며 개발 빌드에서 `console.warn`을 남긴다 (티켓 20260905_0036).
   */
  rarity?: Rarity | null;
  /**
   * 칩 크기 (티켓 20260906_2140). `sm`(기본) = 8px 라벨 · 4/9 패딩 — **기존 렌더 그대로**라
   * `size`를 넘기지 않는 서비스 호출부는 변화가 없다. `md`·`row` = 12px 라벨 · 줄높이 16px · 2/8 패딩(높이 20px) — 모든 칩의 기준인 ListRowChip과 같다(티켓 20261106_2322, 20261112_0010). `md`는 예전에 5/10 패딩(22px)이었다.
   */
  size?: 'sm' | 'md' | 'row';
  className?: string;
  /**
   * true이면 `common`도 칩(`Common`)으로 그린다. 기본 false — Common은 기본 등급이라 칩을 그리지 않는다(노이즈 축소, 티켓 20260827_024).
   * 액티비티 배지 목록처럼 Common도 알려야 하는 화면만 켠다(2026-11-09 사용자 지시). 면은 레벨 칩과 같은 `--default-soft` + `--foreground`다(`--rarity-common` 토큰 값은 그대로).
   */
  showCommon?: boolean;
}

export function RarityBadge(props: RarityBadgeProps): JSX.Element | null;

/**
 * 등급의 텍스트 라벨만 반환한다("Common"/"Rare"/"Epic"/"Mystic") — 렌더링 없이 값만 필요할 때 사용.
 * 등급 없음(null)과 미지 값은 둘 다 `null`을 돌려준다(후자는 개발 빌드에서 경고).
 */
export function getRarityLabel(rarity?: Rarity | null): string | null;
