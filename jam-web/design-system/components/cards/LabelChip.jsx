import React from 'react';

/** 색조별 배경·글자색. 나머지 모양(12px bold 대문자·padding·radius·lineHeight)은 두 색조가 같다. */
const TONES = {
  default: { background: 'var(--background)', color: 'var(--foreground)' },
  inverse: { background: 'var(--background-inverse)', color: 'var(--snow)' },
};

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
 * 변형은 `tone` 하나뿐이다(티켓 20261001_1737, 1248). `default`(기본)는 `--background` 채움 + `--foreground` 글자로
 * 흰 `Card tone="inverse"` 위에서 쓰고, `inverse`는 `--background-inverse` 채움 + `--snow` 글자로
 * 검정 바탕 위(기사 화면)에서 쓴다. 두 색조는 배경·글자색만 다르고 나머지(12px bold 대문자·padding 6px 10px·
 * `--radius-full`·lineHeight 1)는 같다. `size` 변형은 없다.
 * `self-start` 같은 배치는 부모가 flex-col이냐 row 안이냐에 따라 달라지는 호출부 몫이라
 * 컴포넌트에 굳히지 않는다(`className`으로 넘긴다).
 *
 * 비인터랙티브 `<span>` — 터치 대상이 아니다(44px 규칙 비해당). `children`이 비어 있으면
 * 빈 필이 남지 않게 아무것도 그리지 않는다.
 */
export function LabelChip({ tone = 'default', children, className = '', style = {}, ...rest }) {
  if (children == null || children === '') return null;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 'var(--text-xs)',
        lineHeight: 1,
        fontWeight: 700,
        textTransform: 'uppercase',
        padding: '6px 10px',
        borderRadius: 'var(--radius-full)',
        ...(TONES[tone] ?? TONES.default),
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
