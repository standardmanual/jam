import React from 'react';

/**
 * LabelChip — 카드 좌상단에 놓는 짙은 회색 «라벨 필». 티켓 20261001_1204(상위 20260930_1453 b0).
 *
 * 홈 화면 세 곳(`TodayStatusStrip`의 CellLabel · `OnboardingQuestCard`의 Chip ·
 * `TodayCardStack`의 TemplateChip)에 같은 Tailwind 클래스 문자열로 복제돼 있던 마크업을
 * 하나로 합쳤다(티켓 20260927_2235). 인라인 style은 그 클래스를 **계산값 그대로** 옮긴 것이다
 * (`px-2.5`=10px · `py-1.5`=6px, root 16px 기준) — 호출부 렌더가 픽셀 단위로 같아야 해서
 * 여기서 다듬지 않는다. `letterSpacing`·`minHeight`·`nowrap`·그림자는 일부러 넣지 않았다.
 *
 * 왜 기존 컴포넌트가 아닌가: `ShapeTag`는 minHeight 44px·padding 10/16·letterSpacing·태그
 * 팔레트가 붙어 있어 픽셀이 달라지고, `RarityBadge`는 등급 전용, `BadgeLevelChip`은 Lv.N 필
 * 전용이다.
 *
 * 변형 prop(tone·size)은 없다 — 지금 쓰이는 모양이 하나뿐이다. 반전 색조는 이후 필요할 때 더한다.
 * `self-start` 같은 배치는 부모가 flex-col이냐 row 안이냐에 따라 달라지는 호출부 몫이라
 * 컴포넌트에 굳히지 않는다(`className`으로 넘긴다).
 *
 * 비인터랙티브 `<span>` — 터치 대상이 아니다(44px 규칙 비해당). `children`이 비어 있으면
 * 빈 필이 남지 않게 아무것도 그리지 않는다.
 */
export function LabelChip({ children, className = '', style = {}, ...rest }) {
  if (children == null || children === '') return null;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 'var(--text-caption)',
        lineHeight: 1,
        fontWeight: 700,
        textTransform: 'uppercase',
        padding: '6px 10px',
        borderRadius: 'var(--radius-tags)',
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
