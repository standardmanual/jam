import React from 'react';

/**
 * BadgeSilhouette — 미획득 배지의 «외형 비공개» 표시. 티켓 20260905_0036.
 *
 * 왜 원본 이미지를 쓰지 않나:
 * 지금까지 미획득 배지는 원본 `imageUrl`을 그대로 `<img>`에 넣고 `filter: grayscale(1)`만
 * 걸어 왔다(BadgeStageRail·DualAxisGauge·UnlockConditionSheetContent·BadgeGridCard 5곳).
 * 그런데 grayscale은 «그려진 뒤» 적용되는 CSS 필터라 **원본 URL이 그대로 네트워크에 나가고**
 * 개발자도구·네트워크 탭·직접 열기로 컬러 원본을 볼 수 있다 — 「아직 안 보여준다」가
 * 성립하지 않는다. 이 컴포넌트는 배지별 이미지를 아예 요청하지 않고, 모든 배지가 공유하는
 * 공통 SVG 한 장을 `opacity .22`로 그린다. 어떤 배지인지는 «조건 텍스트»가 말한다.
 *
 * 색을 새로 만들지 않는다 — `currentColor`를 상속받아 부모 텍스트색(보통
 * `--color-text`)을 그대로 쓰고 투명도만 낮춘다.
 *
 * 접근성: 항상 `aria-hidden`이다. 호출부가 이름·등급·조건을 이미 텍스트나 `aria-label`로
 * 노출하고 있고, 이 실루엣은 그 정보를 하나도 더 담고 있지 않다(모든 배지가 같은 그림).
 */
export function BadgeSilhouette({ size = 44, opacity = 0.22, className = '', style = {} }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        width: size, height: size, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="100%"
        height="100%"
        fill="currentColor"
        style={{ opacity, display: 'block' }}
        focusable="false"
      >
        {/* 메달(원) + 리본 — 배지 계열·등급과 무관한 공통 형태 한 가지만 쓴다. */}
        <circle cx="12" cy="9" r="6.4" />
        <path d="M7.6 14.6 5.2 21.4a.6.6 0 0 0 .82.73L12 19.6l5.98 2.53a.6.6 0 0 0 .82-.73l-2.4-6.8a8.4 8.4 0 0 1-9.2 0Z" />
      </svg>
    </span>
  );
}
