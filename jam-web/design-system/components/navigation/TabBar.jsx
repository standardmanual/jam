import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/*
 * 20261109_1310: 반전 상태(`inverted`) — 서비스 `src/components/ui/TabBar.tsx`·transitions.css(.jam-tabbar-*,
 * 티켓 20261109_1153)와 같은 모양이다(병존 구현이라 함께 봐야 함). 캡슐 면을 «밝은 면»(.ds-tabbar-chrome)과
 * «반전 면»(.ds-tabbar-chrome-inverse) 두 레이어로 나눠 opacity만 교차한다. background-color·blur는
 * 보간하지 않는다(탁한 회색·iOS 끊김). 푸터 감지는 호출부의 일이라 controlled prop만 둔다.
 *
 * 20260823_003: 재질(반투명 흰 필) — 기존 불투명 흰 필의 색은 그대로 두고 알파+blur만
 * 추가한다(--tabbar-background). 투명도 줄이기 설정에서는 불투명 흰 면(--surface)이다. TopNav는 이번 범위에서
 * 제외(기존 불투명 크롬 유지). 서비스 `src/components/ui/TabBar.tsx`(별도 Tailwind
 * 구현, 미연결)는 여기와 동일한 토큰(--tabbar-blur, --tabbar-background)을
 * 참조하는 `.jam-tabbar-chrome` 클래스를 transitions.css에 별도로 두어 값이 갈리지
 * 않게 맞췄다 — 두 파일을 함께 봐야 함.
 * 비활성 아이콘 대비 재보정(--tabbar-icon)은 tokens/colors.css 참조.
 *
 * 20260901_1521: 활성 배경 필 슬라이딩 트랜지션 — 서비스 SlidingTabs.tsx(16-tabs-sliding.md)의
 * JS 포지셔닝 패턴(transform/opacity를 JS가 쓰고 트윈은 CSS가 소유)만 차용한다. duration/
 * easing은 서비스 --tabs-dur(300ms)/--tabs-ease와 동일한 값을 이 DS 토큰(--ease-smooth-out)으로
 * 맞췄다.
 *
 * 20261114_1418: 활성 탭에만 아이콘 옆에 이름표(탭 label)를 보인다 — 서비스 `src/components/ui/TabBar.tsx`·
 * transitions.css(.jam-tabbar-slot·.jam-tabbar-label)와 같은 모양이다(병존 구현이라 함께 봐야 함). 활성 슬롯이 넓어져
 * 슬롯 폭과 필을 측정(offsetWidth)이 아니라 «계산»(computeSlotLayout)으로 같은 값·같은 길이·같은 이징에 전환한다.
 * 글자 크기는 탭바 전용 토큰 --tabbar-label-size(tokens/typography.css).
 */
const STATIC_CSS = `.ds-tabbar-chrome,.ds-tabbar-chrome-inverse{position:absolute;inset:0;border-radius:inherit;pointer-events:none;transition:opacity var(--duration-fast) var(--ease-smooth-out)}.ds-tabbar-chrome-inverse{background:var(--tabbar-background-inverse);backdrop-filter:blur(var(--tabbar-blur)) saturate(180%);-webkit-backdrop-filter:blur(var(--tabbar-blur)) saturate(180%);opacity:0}.ds-tabbar[data-inverted="true"] .ds-tabbar-chrome{opacity:0}.ds-tabbar[data-inverted="true"] .ds-tabbar-chrome-inverse{opacity:1}.ds-tabbar-icon{transition:color var(--duration-fast) var(--ease-smooth-out)}@media(prefers-reduced-motion:reduce){.ds-tabbar-chrome,.ds-tabbar-chrome-inverse,.ds-tabbar-icon{transition:none!important}}.ds-tabbar-chrome{background:var(--tabbar-background);backdrop-filter:blur(var(--tabbar-blur)) saturate(180%);-webkit-backdrop-filter:blur(var(--tabbar-blur)) saturate(180%)}@media(prefers-reduced-transparency:reduce){.ds-tabbar-chrome{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--surface)}.ds-tabbar-chrome-inverse{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--tabbar-background-inverse-solid)}}.ds-tabbar-pill{transition:transform 300ms var(--ease-smooth-out),width 300ms var(--ease-smooth-out),opacity 300ms var(--ease-smooth-out),background-color var(--duration-fast) var(--ease-smooth-out);will-change:transform,opacity}.ds-tabbar-slot{flex:1 1 0%;padding:0;overflow:hidden;justify-content:center;transition:flex-basis 300ms var(--ease-smooth-out)}.ds-tabbar-slot[aria-current="page"]{flex:0 0 auto;padding-inline:10px;justify-content:flex-start}.ds-tabbar-label{font-family:var(--font-family-base);font-size:var(--tabbar-label-size);line-height:var(--tabbar-label-line-height);font-weight:700;flex:none;white-space:nowrap;word-break:keep-all;overflow-wrap:break-word}.ds-tabbar-label-enter{animation:ds-tabbar-label-in var(--duration-fast) var(--ease-smooth-out) 80ms backwards}@keyframes ds-tabbar-label-in{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.ds-tabbar-pill,.ds-tabbar-slot{transition:none!important}.ds-tabbar-label,.ds-tabbar-label-enter{animation:none!important}}`;

/*
 * 탭바 기하값은 Figma 원본(file UXcBEgFagmO5ARwH5F0mMW, node 11:218 "Tab Bar Buttons")
 * 실측을 따른다 — 티켓 20260901_1626. 서비스 `src/components/ui/TabBar.tsx`와 동일.
 *
 *   BG(탭바 전체)      395 × 49
 *   Selection(활성 필)  87 × 41   → 상하좌우 여백 4px 균일
 *
 * **반경은 억지로 같게 맞추지 않는다.** Figma는 nav·필 둘 다 완전 라운드라 각자 자기
 * 높이의 절반으로 auto-clamp되고(24.5 / 20.5), 그 차이가 정확히 여백(4px)과 같아 두 호가
 * 평행한 동심원이 된다. 폭도 상수로 두지 않고 활성 탭 슬롯의 실측 폭을 그대로 쓴다.
 */
const PILL_HEIGHT = 41;

// 슬롯 폭 계산 — 서비스 TabBar.tsx의 computeSlotLayout과 같은 식이다(두 파일을 함께 고친다).
const NAV_PADDING_X = 4;
const ICON_SIZE = 24;
const LABEL_GAP = 6;
const SLOT_PADDING_X = 10;
const MIN_TOUCH = 44;
function computeSlotLayout(innerWidth, count, activeIndex, labelWidth) {
  if (count <= 0 || activeIndex < 0 || activeIndex >= count || count === 1 || !(labelWidth >= 0)) {
    return { widths: Array(Math.max(count, 0)).fill(innerWidth / count), pillLeft: null, pillWidth: 0, activePadding: 0 };
  }
  const content = ICON_SIZE + LABEL_GAP + labelWidth;
  const natural = content + SLOT_PADDING_X * 2;
  const cap = innerWidth - (count - 1) * MIN_TOUCH;
  const active = Math.max(content, Math.min(natural, cap));
  const other = (innerWidth - active) / (count - 1);
  const widths = Array.from({ length: count }, (_, i) => (i === activeIndex ? active : other));
  const pillLeft = NAV_PADDING_X + widths.slice(0, activeIndex).reduce((a, b) => a + b, 0);
  return { widths, pillLeft, pillWidth: active, activePadding: (active - content) / 2 };
}

/**
 * TabBar — floating pill bottom navigation.
 * 5 tabs: today / badges / drops / missions / inventory.
 * Active state: filled icon + label (활성 탭에만) + sliding background pill. 비활성은 아이콘뿐.
 *
 * v2 changes:
 *   - bottom offset now respects env(safe-area-inset-bottom) — iPhone home indicator clearance
 *   - Removed misleading "purple active" comment (active icon color is --tabbar-icon-active; it was --accent, now --foreground (DS black))
 *
 * 20260901_1521: 활성 점 제거, 배경 필에 슬라이딩 모션 추가(단일 pill +
 * offsetLeft/offsetWidth 측정 — 서비스 `src/components/ui/TabBar.tsx`도 함께 수정했다).
 *
 * 20260824_010: 프로필 탭 제거(6탭→5탭) — 프로필 진입은 TopNav 우측 아바타로 일원화.
 * 서비스 `src/components/ui/TabBar.tsx`(병존 구현, 20260820_009)도 함께 수정해야 한다.
 *
 * 20260901_1926: props를 서비스 기준으로 재정렬.
 *   - `username` 추가 — 서비스는 이 값으로 pathname/searchParams(`?u=`)를 조합해 "다른
 *     유저 프로필 맥락"인지를 판정하고 활성 탭을 계산한다(`isActive()`, TabBar.tsx 참고).
 *     이 DS 컴포넌트는 Next.js 라우터가 없어 그 판정을 재현하지 않는다 — `data-username`
 *     속성으로만 값을 반영해 값이 전달됐음을 확인할 수 있게 한다.
 *   - `active`/`onChange`는 그대로 유지한다. 서비스는 `active`를 외부 prop으로 받지 않고
 *     pathname으로 직접 판단하지만(단일 필드가 아니라 tabs 배열 순회 결과), MODULAR은
 *     라우터가 없는 독립 카탈로그 컴포넌트라 명시적 controlled prop이 계속 필요하다.
 */

const icons = {
  // 20260901: 다른 4개 탭은 이미 Material Symbols(0 -960 960 960 좌표계)로 교체됐는데
  // today만 예전 24x24 커스텀 path로 남아 있어 선 두께가 유독 얇게 보였다 — 동일한
  // Material Symbols "home" 아이콘으로 교체해 두께를 맞춘다. 서비스 TabBar.tsx도 동일.
  today: {
    fill: <path d="M160-120v-480l320-240 320 240v480H560v-280H400v280H160Z" fill="currentColor" />,
    line: <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z" fill="currentColor" />,
  },
  badges: {
    fill: <path d="M395-475q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35ZM240-40v-309q-38-42-59-96t-21-115q0-134 93-227t227-93q134 0 227 93t93 227q0 61-21 115t-59 96v309l-240-80-240 80Zm410-350q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70Z" fill="currentColor" />,
    line: <path d="M395-475q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35ZM240-40v-309q-38-42-59-96t-21-115q0-134 93-227t227-93q134 0 227 93t93 227q0 61-21 115t-59 96v309l-240-80-240 80Zm410-350q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70ZM320-159l160-41 160 41v-124q-35 20-75.5 31.5T480-240q-44 0-84.5-11.5T320-283v124Zm160-62Z" fill="currentColor" />,
  },
  drops: {
    // 20260827_026: 다른 탭 아이콘 대비 여백이 커 시각적으로 작아 보여 1.1배 확대 보정
    // (badges 아이콘의 바운딩 박스와 정렬 — 원본 좌표계·형태는 그대로, 중심 기준 확대만)
    fill: <g transform="translate(-48,48) scale(1.1)"><path d="M307-113.5Q240-147 240-200q0-24 14.5-44.5T295-280l63 59q-9 4-19.5 9T322-200q13 16 60 28t98 12q51 0 98.5-12t60.5-28q-7-8-18-13t-21-9l62-60q28 16 43 36.5t15 45.5q0 53-67 86.5T480-80q-106 0-173-33.5ZM480-200Q339-304 269.5-402T200-594q0-71 25.5-124.5T291-808q40-36 90-54t99-18q49 0 99 18t90 54q40 36 65.5 89.5T760-594q0 94-69.5 192T480-200ZM480-520q33 0 56.5-23.5T560-600q0-33-23.5-56.5T480-680q-33 0-56.5 23.5T400-600q0 33 23.5 56.5T480-520Z" fill="currentColor" /></g>,
    line: <g transform="translate(-48,48) scale(1.1)"><path d="M307-113.5Q240-147 240-200q0-24 14.5-44.5T295-280l63 59q-9 4-19.5 9T322-200q13 16 60 28t98 12q51 0 98.5-12t60.5-28q-7-8-18-13t-21-9l62-60q28 16 43 36.5t15 45.5q0 53-67 86.5T480-80q-106 0-173-33.5ZM481-300q99-73 149-146.5T680-594q0-102-65-154t-135-52q-70 0-135 52t-65 154q0 67 49 139.5T481-300Zm-1 100Q339-304 269.5-402T200-594q0-71 25.5-124.5T291-808q40-36 90-54t99-18q49 0 99 18t90 54q40 36 65.5 89.5T760-594q0 94-69.5 192T480-200Zm0-320q33 0 56.5-23.5T560-600q0-33-23.5-56.5T480-680q-33 0-56.5 23.5T400-600q0 33 23.5 56.5T480-520Zm0-80Z" fill="currentColor" /></g>,
  },
  missions: {
    fill: <path d="m368-320 112-84 110 84-42-136 112-88H524l-44-136-44 136H300l110 88-42 136ZM160-160q-33 0-56.5-23.5T80-240v-135q0-11 7-19t18-10q24-8 39.5-29t15.5-47q0-26-15.5-47T105-556q-11-2-18-10t-7-19v-135q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v135q0 11-7 19t-18 10q-24 8-39.5 29T800-480q0 26 15.5 47t39.5 29q11 2 18 10t7 19v135q0 33-23.5 56.5T800-160H160Z" fill="currentColor" />,
    line: <path d="m368-320 112-84 110 84-42-136 112-88H524l-44-136-44 136H300l110 88-42 136ZM160-160q-33 0-56.5-23.5T80-240v-135q0-11 7-19t18-10q24-8 39.5-29t15.5-47q0-26-15.5-47T105-556q-11-2-18-10t-7-19v-135q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v135q0 11-7 19t-18 10q-24 8-39.5 29T800-480q0 26 15.5 47t39.5 29q11 2 18 10t7 19v135q0 33-23.5 56.5T800-160H160Zm0-80h640v-102q-37-22-58.5-58.5T720-480q0-43 21.5-79.5T800-618v-102H160v102q37 22 58.5 58.5T240-480q0 43-21.5 79.5T160-342v102Zm320-240Z" fill="currentColor" />,
  },
  inventory: {
    fill: <path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm-40-600h640v-120H160v120Zm200 280h240v-80H360v80Z" fill="currentColor" />,
    line: <path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z" fill="currentColor" />,
  },
};

const tabs = [
  { key: 'today',     label: '투데이' },
  { key: 'badges',    label: '배지' },
  { key: 'drops',     label: '체크인' },
  { key: 'missions',  label: '미션' },
  { key: 'inventory', label: '인벤토리' },
];

export function TabBar({ active = 'today', onChange, username, inverted = false }) {
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef(new Map());
  // 첫 페인트에서는 애니메이션 없이 스냅시켜야 한다 (서비스 SlidingTabs.tsx와 동일).
  const hasPositionedRef = useRef(false);
  const activeRef = useRef(active);
  // 마운트 때 이미 활성이던 탭의 이름표에는 등장 애니메이션을 걸지 않는다(서비스 TabBar.tsx와 같은 규칙).
  // 활성 탭이 처음 바뀌는 렌더에서 비우고, 그 뒤 새로 마운트되는 이름표만 .ds-tabbar-label-enter를 받는다.
  const [initialKey, setInitialKey] = useState(active);
  if (initialKey !== null && initialKey !== active) setInitialKey(null);
  useLayoutEffect(() => {
    activeRef.current = active;
  });

  // 서비스 SlidingTabs.tsx의 moveTo()를 이식한 것. `active`가 이미 value/onChange로
  // 제어되는 controlled prop이라 이 컴포넌트는 SlidingTabs 패턴을 그대로 적용할 수 있다.
  // 20261114_1418: 필 위치·폭은 슬롯 실측이 아니라 computeSlotLayout 계산값이고, 같은 값을 모든 슬롯의
  // flex-basis에도 쓴다(슬롯 폭 전환 중에 읽으면 중간값이라 필이 틀어지기 때문).
  const moveTo = useCallback((key, animate) => {
    const pill = pillRef.current;
    const nav = navRef.current;
    const tab = tabRefs.current.get(key);
    if (!pill || !nav || !tab) return false;
    const slots = tabs.map((t) => tabRefs.current.get(t.key));
    if (slots.some((el) => !el)) return false;

    const label = tab.querySelector('[data-ds-tabbar-label]');
    const labelWidth = label ? label.getBoundingClientRect().width : 0;
    const innerWidth = nav.getBoundingClientRect().width - NAV_PADDING_X * 2;
    const layout = computeSlotLayout(innerWidth, tabs.length, tabs.findIndex((t) => t.key === key), labelWidth);

    const apply = () => {
      slots.forEach((el, i) => {
        el.style.flex = `0 0 ${layout.widths[i]}px`;
        // 활성 슬롯은 왼쪽 정렬 + 계산한 안쪽 여백(CSS) — 서비스 TabBar.tsx와 같다. 다른 슬롯은 비워서 CSS로 돌린다.
        el.style.paddingInline = el === tab ? `${layout.activePadding}px` : '';
      });
      pill.style.opacity = '1';
      pill.style.width = `${layout.pillWidth}px`;
      pill.style.transform = `translate(${layout.pillLeft}px, -50%)`;
    };

    if (!animate) {
      const prevPill = pill.style.transition;
      pill.style.transition = 'none';
      slots.forEach((el) => { el.style.transition = 'none'; });
      apply();
      void pill.offsetWidth;
      pill.style.transition = prevPill;
      slots.forEach((el) => { el.style.transition = ''; });
    } else {
      apply();
    }
    return true;
  }, []);

  // 활성 탭 변경 — 첫 배치만 무애니메이션, 이후에는 트윈.
  useLayoutEffect(() => {
    const positioned = moveTo(active, hasPositionedRef.current);
    if (positioned) hasPositionedRef.current = true;
  }, [active, moveTo]);

  // 리사이즈 — 항상 무애니메이션으로 재배치 (deps에 active를 넣지 않는 이유는
  // 서비스 SlidingTabs.tsx와 동일 — ResizeObserver 최초 발화가 방금 트리거된 트윈을
  // 캔슬하는 것을 막기 위함).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const reposition = () => moveTo(activeRef.current, false);

    const observer = new ResizeObserver(reposition);
    observer.observe(nav);
    window.addEventListener('resize', reposition);
    // 이름표 폭은 웹폰트 로드 전후가 다르다 — 로드가 끝나면 무애니메이션으로 다시 계산한다.
    document.fonts?.ready.then(reposition).catch(() => {});

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reposition);
    };
  }, [moveTo]);

  return (
    <>
    <style>{STATIC_CSS}</style>
    <nav ref={navRef} className="ds-tabbar" data-inverted={inverted ? 'true' : 'false'} data-username={username ?? undefined} style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      /* v2: safe-area-inset-bottom prevents overlap with iPhone home indicator.
         20260824_014: 0px clamp가 페이지 하단에 완전히 붙어버려 여백이 사라짐 —
         최소 여백 10px로 재조정. */
      bottom: 'max(10px, calc(var(--spacing-16) + var(--spacing-safe-bottom) - 32px))',
      // 높이 49px·가로 388px·좌우 패딩 4px은 Figma 실측값(위 상수 주석 참고).
      width: 'calc(100% - 42px)', maxWidth: 388, height: 49,
      // 완전 라운드 — nav는 자기 높이의 절반(24.5px), 필은 자기 높이의 절반(20.5px)으로
      // clamp돼 두 호가 4px 간격의 동심원이 된다(의도된 동작).
      borderRadius: 'var(--radius-full)',
      // 20260816_012: 보더 제거 — 반투명 흰 크롬 + blur로 구분한다. 크림 바탕 위에서는 경계가 약하다:
      // 모양을 그대로 두고 렌더를 본 뒤 외곽선 여부를 정한다(티켓 20261015_2133, 사용자 결정 9).
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 4px', zIndex: 40,
    }}>
      {/* 면 레이어 두 장 — DOM 맨 앞이라 필·아이콘 아래에 깔리고 클릭은 통과시킨다(20261109_1310). */}
      <span aria-hidden="true" className="ds-tabbar-chrome" />
      <span aria-hidden="true" className="ds-tabbar-chrome-inverse" />
      {/* 활성 탭 배경 필 — 단일 공유 pill을 활성 탭의 offsetLeft/offsetWidth 중앙으로
          translateX 이동시킨다(moveTo, 위 참고) — 탭 전환 시 스냅 대신 미끄러지는 모션이
          생긴다(20260901_1521). 양옆은 완전히 둥글고 위아래는 직선인 캡슐 모양 — 높이보다
          폭을 넓게 잡고 radius-pill(반경이 짧은 변인 높이로 자연히 클램프됨)을 적용해
          만든다. 화이트가 아니라 반투명 그레이 — 흰 필 위에 살짝 어두운 톤을 얹어 구분한다. */}
      <span
        aria-hidden="true"
        ref={pillRef}
        className="ds-tabbar-pill"
        style={{
          position: 'absolute', top: '50%', left: 0,
          // 폭은 moveTo가 활성 탭 슬롯 실측값으로 매번 지정한다(위 상수 주석 참고).
          height: PILL_HEIGHT, borderRadius: 'var(--radius-full)',
          background: inverted ? 'var(--tabbar-selection-inverse)' : 'var(--tabbar-selection)',
          opacity: 0, transform: 'translate(0px, -50%)',
        }}
      />
      {tabs.map((t) => {
        const isActive = t.key === active;
        const ic = icons[t.key];
        return (
          <button
            key={t.key}
            aria-label={t.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange && onChange(t.key)}
            ref={(el) => {
              if (el) tabRefs.current.set(t.key, el);
              else tabRefs.current.delete(t.key);
            }}
            className="ds-tabbar-slot"
            style={{
              position: 'relative', height: '100%', minWidth: 44,
              border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span className="ds-tabbar-icon" style={{
              position: 'relative',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: inverted
                ? (isActive ? 'var(--snow)' : 'var(--tabbar-icon-inverse)')
                : (isActive ? 'var(--tabbar-icon-active)' : 'var(--tabbar-icon)'),
            }}>
              {/* 20260901: today도 Material Symbols 좌표계로 교체돼 5개 탭 전부 동일
                  viewBox를 쓴다(20260827_026 당시엔 today만 예외였으나 두께 불일치로 정리). */}
              <svg viewBox="0 -960 960 960" fill="none" width={24} height={24} style={{ flex: 'none' }}>
                {isActive ? ic.fill : ic.line}
              </svg>
              {/* 20261114_1418: 이름표는 활성 탭에만. 색은 바깥 span을 상속해 아이콘과 같이 전환된다.
                  같은 글자를 aria-label이 이미 읽으므로 보조기기에서는 숨긴다. */}
              {isActive && (
                <span aria-hidden="true" data-ds-tabbar-label className={t.key === initialKey ? 'ds-tabbar-label' : 'ds-tabbar-label ds-tabbar-label-enter'}>{t.label}</span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
    </>
  );
}
