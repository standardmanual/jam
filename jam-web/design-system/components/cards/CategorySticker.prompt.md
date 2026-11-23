# CategorySticker

홈피드 «분류 스티커». 티켓 20261122_2227(상위 20261122_2217) 신규. 부품만 있고 호출부는 다음 티켓(20261122_2228)이 붙인다.

## 왜 기존 컴포넌트가 아닌가

- `LabelChip` — 20px 알약 필 하나. 둘레 글자·불규칙 윤곽·로고 글자가 있는 도형은 `tone`으로 늘릴 수 없다.

```jsx
<CategorySticker shape="pebble" seed={card.id} label="MISSION" pair="sky-red" letter="m" />
<CategorySticker shape="wave" seed={card.id} label="COLLECTION" pair="green-pink" letter="J" />
```

## 규칙

- 모양은 `shape`: `pebble`(116×84) · `wave`(112×92). 크기가 고정이라 `size` prop이 없고 `className`만 연다.
- 윤곽은 `seed`로 정한다. 같은 (shape, seed)는 늘 같은 path다(`Math.random`·`Date` 금지, 좌표는 소수 둘째 자리).
- 둘레 글자: «문구 · »을 최소 두 번 되풀이, 굵기 900, 조약돌 11px·물결 10px 기준, 길면 글자를 줄인다(하한 7px, 압축·자간 음수 금지). 남는 길이는 자간으로 채운다. 글자 선은 조약돌 가장자리에서 17px, 물결은 혹을 뺀 바탕에서 15px 안쪽이며 줄이지 않는다.
- 가운데 로고 글자: `letter`(J·a·m) 한 글자를 `jam-logo.svg`의 path로 그린다(PNG 자르기 금지). 색 채움 + `--foreground` 외곽선 1.6px, `paint-order: stroke`로 속이 먹히지 않는다.
- 색 짝 `pair`는 8개(`yellow-purple` · `purple-yellow` · `green-pink` · `pink-green` · `sky-red` · `red-sky` · `blue-yellow` · `yellow-blue`, 앞이 바탕·뒤가 로고 글자). 알 수 없는 이름은 d.ts 유니온이 막고 다른 짝으로 대체하지 않는다. 값은 `var(--jam-*)` 참조만 쓴다.
- `label`이 비면 둘레 글자 없이 바탕과 로고만 그리고 `aria-hidden`이다(도형 자체는 유효). 문구가 있으면 `role="img"` + `aria-label`=문구.
- 평면 색 + 본문색 선뿐이다. 그라디언트·그림자·유리질·움직임을 더하지 않는다.
- 비인터랙티브라 44px 터치 영역 규칙에 해당하지 않는다. 겹침 규칙은 호출부 몫이다.
- 순수 함수 `pebbleShape`·`waveShape`·`fitRingText`가 계산을 맡고 컴포넌트는 그리기만 한다.
