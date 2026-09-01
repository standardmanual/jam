import React from 'react';

/*
 * 20260823_003: 재질(반투명 흰 필) — 기존 불투명 흰 필(--color-bg-inverse)의 색은
 * 그대로 두고 알파+blur만 추가한다(--color-chrome-bg-inverse). TopNav는 이번 범위에서
 * 제외(기존 불투명 크롬 유지). 서비스 `src/components/ui/TabBar.tsx`(별도 Tailwind
 * 구현, 미연결)는 여기와 동일한 토큰(--blur-chrome, --color-chrome-bg-inverse)을
 * 참조하는 `.jam-tabbar-chrome` 클래스를 transitions.css에 별도로 두어 값이 갈리지
 * 않게 맞췄다 — 두 파일을 함께 봐야 함.
 * 비활성 아이콘 대비 재보정(--color-icon-inactive)은 tokens/colors.css 참조.
 */
const STATIC_CSS = `.ds-tabbar-chrome{background:var(--color-chrome-bg-inverse);backdrop-filter:blur(var(--blur-chrome)) saturate(180%);-webkit-backdrop-filter:blur(var(--blur-chrome)) saturate(180%)}@media(prefers-reduced-transparency:reduce){.ds-tabbar-chrome{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--color-bg-inverse)}}`;

/**
 * TabBar — floating pill bottom navigation.
 * 5 tabs: today / badges / drops / missions / inventory.
 * Active state: filled icon + primary color + dot indicator + 44px background pill.
 *
 * v2 changes:
 *   - bottom offset now respects env(safe-area-inset-bottom) — iPhone home indicator clearance
 *   - Removed misleading "purple active" comment (active color is --color-primary = red)
 *
 * 20260901: 활성 탭 아이콘 뒤에 44px 배경 필 추가(전체 필 폭·간격은 기존 유지).
 * 서비스 `src/components/ui/TabBar.tsx`도 함께 수정했다.
 *
 * 20260824_010: 프로필 탭 제거(6탭→5탭) — 프로필 진입은 TopNav 우측 아바타로 일원화.
 * 서비스 `src/components/ui/TabBar.tsx`(병존 구현, 20260820_009)도 함께 수정해야 한다.
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
  { key: 'drops',     label: '드랍' },
  { key: 'missions',  label: '미션' },
  { key: 'inventory', label: '인벤토리' },
];

export function TabBar({ active = 'today', onChange }) {
  return (
    <>
    <style>{STATIC_CSS}</style>
    <nav className="ds-tabbar-chrome" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      /* v2: safe-area-inset-bottom prevents overlap with iPhone home indicator.
         20260824_014: 0px clamp가 페이지 하단에 완전히 붙어버려 여백이 사라짐 —
         최소 여백 10px로 재조정. */
      bottom: 'max(10px, calc(var(--spacing-16) + var(--spacing-safe-bottom) - 32px))',
      width: 'calc(100% - 42px)', maxWidth: 388, height: 64,
      borderRadius: 'var(--radius-pill)',
      // 20260816_012: 보더 제거 — 재질(반투명 크롬)이 다크 배경 위에서 blur로 구분됨
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 4px', zIndex: 40,
    }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        const ic = icons[t.key];
        return (
          <button
            key={t.key}
            aria-label={t.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange && onChange(t.key)}
            style={{
              position: 'relative', flex: 1, height: '100%',
              border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {/* 활성 탭 배경 필 — 서비스 TabBar.tsx와 동일 (20260901) */}
            {isActive && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                // 양옆은 완전히 둥글고 위아래는 직선인 캡슐 모양 — 높이보다 폭을 넓게 잡고
                // radius-pill(반경이 짧은 변인 높이로 자연히 클램프됨)을 적용해 만든다.
                width: 64, height: 48, borderRadius: 'var(--radius-pill)',
                // 화이트가 아니라 반투명 그레이 — 흰 필 위에 살짝 어두운 톤을 얹어 구분한다.
                background: 'rgba(0,0,0,0.08)',
              }} />
            )}
            <span style={{ position: 'relative', color: isActive ? 'var(--color-primary)' : 'var(--color-icon-inactive)' }}>
              {/* 20260901: today도 Material Symbols 좌표계로 교체돼 5개 탭 전부 동일
                  viewBox를 쓴다(20260827_026 당시엔 today만 예외였으나 두께 불일치로 정리). */}
              <svg viewBox="0 -960 960 960" fill="none" width={24} height={24}>
                {isActive ? ic.fill : ic.line}
              </svg>
            </span>
            <span aria-hidden="true" style={{
              position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--color-primary)',
              opacity: isActive ? 1 : 0,
              transition: 'opacity var(--duration-quick) ease',
            }} />
          </button>
        );
      })}
    </nav>
    </>
  );
}
