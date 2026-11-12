import React from 'react';
import { RarityBadge } from './RarityBadge.jsx';
import { BadgeLevelChip } from './BadgeLevelChip.jsx';

/**
 * BadgeHeroSection — «배지 한 장의 대표 카드»: 이미지 · 등급/레벨 칩 · 이름 · 설명. 티켓 20261112_1818 (서비스 `src/components/BadgeHeroSection.tsx`를 DS로 승격).
 *
 * 순수 표시 컴포넌트다. 서비스 도메인 지식(이미지 안전 렌더, 블롭 배경, 테마 판정, 설명 문장 나누기)은 모두 호출부가 계산해
 * 슬롯과 값으로 넘긴다. 서비스는 이 컴포넌트를 렌더하는 얇은 어댑터(`BadgeHeroSection.tsx`)를 둔다.
 *
 * 스타일: 이 파일은 DS에서 처음으로 Tailwind 별칭 클래스(`gap-4 p-6`, `text-snow`, `bg-card-bg`, `text-wrap!` 등)를 그대로 쓴다.
 * 승격 전 마크업과 렌더된 DOM · 클래스가 같아야 하고(서비스 시험이 클래스 문자열을 단언한다) 시각 변화가 0이어야 해서다.
 * 색 리터럴은 쓰지 않는다 — 모두 토큰 별칭(`text-snow` · `text-foreground` · `text-muted` · `bg-card-bg`)이다.
 *
 * 구조: 바깥 wrapper > 카드(overflow-hidden, rounded-2xl, 세로 flex, gap-4) > [backgroundSlot z-0] [imageSlot z-10] [글자 블록 z-10].
 * 글자 블록은 flex-1 · justify-end라 이름 블록이 설명에 붙는다(20260917_1245 보완 결정).
 * 카드 높이는 내용이 정한다(aspect-square 고정 없음, 2026-11-09 사용자 지시).
 */

/** size별 바깥 여백 · 카드 안쪽 여백. `page`는 배지 상세 페이지, `sheet`는 바텀시트 안(바깥 여백은 호출부가 정한다) */
const SIZE_STYLE = {
  page: { wrapper: 'relative z-10 px-4 pt-0 pb-5', card: 'p-6' },
  sheet: { wrapper: 'relative z-10', card: 'py-6 px-4' },
};

export function BadgeHeroSection({
  /** 배지 이름 — `titleNode`가 없을 때 h1 안에 그린다 */
  name,
  /** 등급. `level`이 없을 때만 `RarityBadge`로 그린다. null/undefined면 칩이 없다 */
  rarity,
  /** 레벨. 있으면 등급 칩 대신 `BadgeLevelChip`(Lv.N)을 그린다 */
  level,
  /** 설명 문장들 — 문장마다 `<p>` 하나. 문장 나누기는 호출부 몫이다. 없고 `descriptionNode`도 없으면 설명 블록을 그리지 않는다 */
  descriptionLines,
  /** 설명 문단 하나의 내용을 호출부가 정한다. 있으면 `descriptionLines`보다 우선한다 */
  descriptionNode,
  /** h1 안의 내용을 바꾼다. 없으면 `name` */
  titleNode,
  /** 등급·레벨 칩 옆에 더하는 칩(예: «잠김») */
  chipExtra,
  /** 대표 이미지 자리 — 필수. 크기 규칙은 슬롯 안에서 호출부가 정한다 */
  imageSlot,
  /** 카드 안 최하단(z-0)에 깔리는 배경. 카드 안에 갇히고 라운드로 잘린다 */
  backgroundSlot,
  /** 첫 페인트 폴백 배경색(인라인). 배경 슬롯이 늦게 그려질 때 카드를 먼저 채운다 */
  backgroundColor,
  /** 카드 면이 투명해지고 글자가 모두 `text-snow`가 된다. 어두운 면 위 전용 */
  onMedia = false,
  /** 글자 블록에 거는 style(예: 배경 위 텍스트 그림자 보정). DS는 값을 모른다 */
  textStyle,
  /** 'page'(기본) | 'sheet' */
  size = 'page',
}) {
  const sizeStyle = SIZE_STYLE[size] ?? SIZE_STYLE.page;
  const chip = level != null ? <BadgeLevelChip level={level} size="md" /> : <RarityBadge rarity={rarity ?? undefined} size="md" />;

  return (
    <div className={sizeStyle.wrapper}>
      <div
        className={[
          `relative overflow-hidden w-full rounded-2xl flex flex-col items-center gap-4 ${sizeStyle.card}`,
          onMedia ? 'bg-transparent' : 'bg-card-bg',
        ].join(' ')}
        style={backgroundColor ? { backgroundColor } : undefined}
      >
        {backgroundSlot}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center">{imageSlot}</div>
        <div
          className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-end gap-1 overflow-hidden"
          style={textStyle}
        >
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            {chipExtra ? (
              <div className="flex items-center gap-2">
                {chip}
                {chipExtra}
              </div>
            ) : (
              chip
            )}
            <h1 className={`text-3xl font-bold text-center ${onMedia ? 'text-snow' : 'text-foreground'}`}>{titleNode ?? name}</h1>
          </div>
          {descriptionNode ? (
            <div className="flex-shrink-0 flex flex-col gap-0.5">
              <p className={`text-base text-center text-wrap! ${onMedia ? 'text-snow' : 'text-muted'}`}>{descriptionNode}</p>
            </div>
          ) : (
            descriptionLines && (
              <div className="flex-shrink-0 flex flex-col gap-0.5">
                {descriptionLines.map((line, index) => (
                  <p key={index} className={`text-base text-center text-wrap! ${onMedia ? 'text-snow' : 'text-muted'}`}>
                    {line}
                  </p>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
