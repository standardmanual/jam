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
