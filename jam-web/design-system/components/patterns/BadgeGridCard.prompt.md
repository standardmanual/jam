배지 그리드 셀 패턴. 배지 썸네일 + 이름 + 희귀도 필을 하나의 카드로 묶는다.

```jsx
// 기본 (획득 완료)
<BadgeGridCard name="도봉산 정상" rarity="rare" imageUrl="/badges/dobong.png" href="/badges/123" />

// 미획득 (흑백+반투명)
<BadgeGridCard name="한강 완주" rarity="epic" earned={false} />

// 미발견 (아이템북 후보 없는 칸 — 이미지 없이 윤곽 점선 + 원래 이름, 등급 칩 없음)
<BadgeGridCard name="한강 완주" imageUrl="/badges/han.png" rarity="common" undiscovered={true} />

// 넣을 수 있는 칸 — 회색 이미지 위에 같은 점선을 겹친다
<BadgeGridCard name="한강 완주" imageUrl="/badges/han.png" rarity="common" earned={false} outlined={true} />

// 선택 모드
<BadgeGridCard name="북한산" rarity="mystic" selected={true} onClick={() => setSelected(id)} />

// 컬렉션 슬롯 장착 모드 — "지금 넣을 수 있는 칸" 강조
<BadgeGridCard name="장착 가능 칸" rarity="epic" highlighted={true} href="/collections/1?slot=1" />

// 잠김 — 열기 전의 아이템 배지. 이름·그림은 넘기지 않는다(넘겨도 그리지 않는다)
<BadgeGridCard locked rarity="rare" fillPercent={40} href="/inventory/123" />
```

`children`에 만료일 문구나 "슬롯에 넣기" 버튼을 추가할 수 있다.
그리드 레이아웃은 호출부에서 결정한다 (예: `grid-template-columns: repeat(3, 1fr)`).

- 카드 면은 `--surface`(흰) + 1px `--border`, 그림자 없음이다(크림 바탕과 흰 면은 1.05:1이라 테두리가 경계를 맡는다).
  `selected`는 면을 `--accent-soft`로 채운다(기본 면과 겹치지 않고 한쪽만 고른다).
- `highlighted`는 컬렉션 슬롯 장착 모드(`/collections/[id]?slot=1`)에서 "지금 넣을 수 있는
  칸"을 짚어주는 강조 링이다. `selected`(면 채움)와는 시각적으로 다르며 둘은 독립적으로
  쓸 수 있다.
- `locked`(티켓 20261018_0054 2회)는 열기 전의 아이템 배지다. 면은 일반 카드와 같고, 썸네일 자리에 `LockedTile`(90px),
  이름 줄은 «잠긴 아이템 배지», 등급 칩 아래에 `ProgressBar outlined`(높이 6, `track-gradient`, 숫자 없음)가 붙는다.
  `fillPercent`는 서버가 준 채운 비율(0~100)이다. **`locked`이면 `imageUrl`·`name`이 넘어와도 그리지 않는다** — 호출부 실수로
  가림이 뚫리지 않게 컴포넌트가 막는다. 등급 색·글로우를 더하지 않는다(등급은 칩 하나로만 전달). 게이지는 `aria-hidden`이라
  진행 수치를 화면에도 보조기술에도 싣지 않는다. 만료 칩 같은 `children`은 게이지 아래에 붙는다.
- `onNavigate`는 `href` 모드에서만 의미가 있다 — `<a href>`로 이동하기 직전에 실행할 부수효과
  클릭 핸들러다(`onClick`은 Button 모드 전용이라 href와 상호 배타).

## 미획득 썸네일 — 원본 + grayscale(1), 미발견은 윤곽 점선

20260905_0036이 한때 실루엣(공통 SVG)으로 바꿨다가 **2026-09-06 사용자 확정으로 되돌렸다.**
외형을 감추는 것보다 **어떤 배지인지 알아볼 수 있는 쪽**을 택한다 — v5는 조건도 전면 공개한다.

⚠️ **서비스는 이 DS 컴포넌트를 쓰지 않는다.** `src/components/ui/BadgeGridCard.tsx`가
별도 사본이다(병존 구현). 미획득은 양쪽 다 grayscale이고(서비스는 opacity-40을 더 건다), 미발견·넣을 수 있는 칸의 점선(`SlotOutline`)은 두 사본이 같은 부품을 쓴다(티켓 20261112_1627).

**미발견(`undiscovered`)만 예외다** (티켓 20261102_1834, 2026-11-02 사용자 지시). 되돌린 것이 아니라
«미발견만 이미지를 걷고 윤곽만, `earned={false}`는 원본 그레이 유지»다. 티켓 20261112_1627(2026-11-12 사용자 확정)에서
이전의 회색 실루엣 채움(`brightness(0) invert(0.64)`)을 걷고 **자기 이미지의 알파 윤곽을 따라가는 점선**으로 바꿨다.

- 이미지는 그리지 않고 `SlotOutline`(`--muted` 불투명, 2px, 선 3 · 간격 4)만 그린다. 추적에 실패하거나 `imageUrl`이 없으면 둥근 사각형 점선이다.
- 이름은 가리지 않는다. 이름 줄은 획득한 칸과 같다. 등급 칩·×N은 그리지 않는다. 점선은 장식(`aria-hidden`)이다.
- `earned={false}`가 함께 와도(서비스 호출부의 실제 조합) 점선이 이긴다. 판정 순서는 `locked` > `undiscovered` > `!earned`다.
- `outlined`(새 prop)는 «지금 넣을 수 있는 칸»이다. 이미지는 grayscale + 반투명이고 그 위에 같은 점선을 **이미지의 형제**로 겹친다
  (이미지 opacity의 영향을 받지 않아 불투명 100%). 추적에 실패하면 이미지가 보이므로 사각형 대체 없이 그리지 않는다.
- 점선 색을 등급색·강조색으로 바꾸지 않는다. 움직이는 점선(마칭 앤츠)을 만들지 않는다.
- 서비스 사본은 추적 주소를 `/_next/image?…&w=256&q=75`로 만든다(`slotOutlineTraceSrc`, 폭 90 이미지가 이미 받는 변환본). DS 사본은 `imageUrl`을 그대로 쓴다.
