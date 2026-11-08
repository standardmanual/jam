General-purpose surface container for grouping content (badge tiles, shortcut tiles, drop cards).

```jsx
<Card>
  <h3>배지를 받았어요</h3>
</Card>
```

- default는 `--card-bg`(흰) 면이고 테두리가 없다. #f5f5f5 바탕(`--background`) 위에서 경계는 면 대비와 여백이 맡고 그림자는 쓰지 않는다. 안쪽 여백은 `--layout-card-padding`이다.
- `tone="tint"`는 `--background-secondary` 면(테두리 없음)이다. 흰 카드 안 구획용이며, 회색 바탕 위 단독 카드로 쓰지 않는다(흰 카드 안 보조 면 전용).
- `tone="inverse"`는 어두운 반전 면(`--background-inverse` + `--snow` 글자)이고 테두리가 없다(default와 박스 크기가 같다). 선택 표시처럼 신호가 필요한 드문 곳에서만 쓰고, 그 위 글자는 `--snow`로 둔다(`--muted`·`--link`는 어두운 면 위 3.1~3.3:1이라 작은 글자에 못 쓴다).
