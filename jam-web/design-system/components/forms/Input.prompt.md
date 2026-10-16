Single-line capsule text field (search, username): `--surface` (white) fill, 1px `--field-border`, `--field-radius` (100px), text `--foreground`, placeholder `--muted`. Same recipe as the service `UserSearchBar`, so a search bar is just a default `Input` (there is no inverse surface).

```jsx
<Input placeholder="유저 검색" value={q} onChange={(e) => setQ(e.target.value)} />
```

`state="error"` draws the border in `--danger`, `state="success"` in `--success`. The border stays 1px and a same-colour inset ring adds the second pixel, so text does not shift when the state changes. The component draws no help or error text — wire your own with `aria-describedby`, and keep that text in `--foreground` (red `--danger` text is only 3.57:1 on white). `--field-border` (#cfc9b4) is 1.66:1 on white and 1.58:1 on cream, below the 3:1 UI-boundary target; the value is kept and its review is an open decision. Focus uses the global `*:focus-visible` ring (`--link` 2px).
