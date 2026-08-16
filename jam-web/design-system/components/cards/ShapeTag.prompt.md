Colored shape container — category tag chip OR a badge/thumbnail box (put an icon/image in as children). 7 shapes (rect, pill, circle, dome, triangle, flag, hex) × 8-color tag palette, cycled by `colorIndex`.

```jsx
<ShapeTag shape="hex" colorIndex={3}>SPA AT HOME</ShapeTag>
<ShapeTag shape="triangle" colorIndex={1} style={{ width: 64, height: 64 }}>
  <img src="/medal.svg" />
</ShapeTag>
```

Use varied shapes for badge thumbnail boxes on Badges/Inventory screens — cycle shape+color by index so a grid reads as a lively tag cloud, matching the reference screenshot.
