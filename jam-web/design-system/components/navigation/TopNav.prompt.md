Sticky top bar for sub-pages (badges detail, drops, inventory item). Root screens (Today) omit it.

```jsx
<TopNav title="배지" onBack={() => router.back()} />
```

## back-label 결정 정책

`title` prop은 현재 화면명이 **아니라** "어디로 돌아가는가"를 뜻하는 back-label이다.
렌더 구조: `[← title ──────] [rightSlot]`

| 진입 패턴 | title | backHref |
|---|---|---|
| 목록 → 상세, 경로 고정 | 목록 화면명 ("미션", "인벤토리") | 있음 (목록 URL) |
| 프로필 → 하위 화면 | 유저명 (username) | 있음 (`/{username}`) |
| 다양한 경로로 진입 가능 | `d.common.back` ("뒤로") | 없음 (router.back) |
| 탭바 루트 화면 | 없음 | showBack=false |

- "뒤로" 고정 문구는 반드시 `d.common.back` 키를 사용한다 — 화면마다 임의의 표현을 쓰지 않는다.
- 컴포넌트 구조(title prop)는 현행 유지한다. backLabel 등 별도 prop으로 분리하지 않는다.

## 20260824_010: 3분할 확장 (좌: 로고/뒤로가기 · 중: 동기화 · 우: 액션+아바타)

전 페이지 공통으로 노출되면서, 탭 최상위(목록) 페이지는 뒤로가기 대신 Jam 로고를 보여주고,
모든 페이지에 스트라바 동기화 버튼과 프로필 아바타가 함께 노출되도록 슬롯 3개를 추가했다.

```jsx
// 탭 최상위 페이지(홈/배지/미션/인벤토리) — 로고 + 동기화 + 아바타
<TopNav
  showBack={false}
  logo={<JamLogo />}
  centerSlot={<SyncEntry />}
  rightSlot={<ProfileAvatarLink />}
/>

// 서브페이지 — 기존 뒤로가기+title 유지, 동기화+아바타만 추가
<TopNav
  title="뒤로"
  backHref="/missions"
  centerSlot={<SyncEntry />}
  rightSlot={<ProfileAvatarLink />}
/>

// 우측 액션 버튼과 아바타를 동시에 노출하려면 rightSlot에 이어붙인다
// (배지 상세 공유 버튼 케이스)
<TopNav
  title="뒤로"
  backHref="/badges/123"
  rightSlot={(
    <>
      <IconButton icon="share" label="공유" />
      <ProfileAvatarLink />
    </>
  )}
/>
```

- `logo`가 있으면 back+title 블록 전체를 대체한다(showBack/title은 무시됨). 20260901_1926에서
  구 prop명 `logoSlot`을 `logo`로 정리했다.
- `centerSlot`은 좌/우 사이 고정폭 영역 — 없으면 렌더링되지 않아 기존 2분할과 동일하다.
  **서비스 `TopNavProps`에는 노출되지 않는 내부 전용 슬롯**이다 — 서비스 래퍼가 스트라바
  동기화 버튼을 내부적으로만 채운다.
- 별도 `avatarSlot`은 20260901_1926에서 제거됐다 — 아바타는 `rightSlot`에 합성해서 넘긴다
  (위 세 번째 예시처럼 기존 액션 버튼 뒤에 이어붙이면 된다).
- header 엘리먼트에 인라인 스타일을 얹어야 하면(배경색 오버라이드 등) `headerStyle`을 쓴다.
  20260901_1926에서 구 prop명 `style`을 `headerStyle`로 정리했다.

  ```jsx
  <TopNav title="아이템북" showBack headerStyle={{ background: 'var(--color-surface)' }} />
  ```
- 실제 서비스 값 주입(로그인 유저 avatar_url/username, 스트라바 연동 상태)은 DS가 아니라
  서비스 래퍼 `src/components/ui/TopNav.tsx`가 컨텍스트(`src/lib/topNavData.tsx`)로 담당한다.
- `/drops`와 본인 프로필(`/{username}`, 티켓 20260820_015)은 TopNav 자체를 노출하지 않는다
  — 이 정책은 변경되지 않았다.
