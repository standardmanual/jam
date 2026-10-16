General-purpose surface container for grouping content (badge tiles, shortcut tiles, drop cards).

```jsx
<Card>
  <h3>배지를 받았어요</h3>
</Card>
```

- default는 `--surface`(흰) 면에 1px `--border` 테두리다. 크림 바탕 위에서 경계는 테두리가 맡고 그림자는 쓰지 않는다. 안쪽 여백은 `--layout-card-padding`이다.
- `tone="tint"`는 `--background-secondary` 면(테두리 없음)이다. 흰 카드 안 구획용이며, 크림 바탕 위 단독 카드로 쓰지 않는다(경계가 보이지 않는다).
- `tone="inverse"`는 어두운 반전 면(`--background-inverse` + `--snow` 글자)이다. 선택 표시처럼 신호가 필요한 드문 곳에서만 쓰고, 그 위 글자는 `--snow`로 둔다(`--muted`·`--link`는 어두운 면 위 3.1~3.3:1이라 작은 글자에 못 쓴다).
