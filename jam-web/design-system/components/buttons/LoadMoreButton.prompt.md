List-bottom «더보기» button shared by notifications, point history and the friend feed. It is a thin composition of `Button variant="outline" fullWidth` — full width, 52px high, `--btn-secondary` pill, label centered in `--foreground` — plus a 16px gap above. It owns no color or size of its own and takes no `className`, so every list looks the same.

```jsx
<LoadMoreButton onClick={loadMore}>더보기</LoadMoreButton>
<LoadMoreButton loading onClick={loadMore}>불러오는 중</LoadMoreButton>
<LoadMoreButton onClick={retry}>다시 시도</LoadMoreButton>
```

The label is written by the caller (i18n key, «더보기» without a space). `loading` shows the spinner and disables the button, which blocks double taps. After an error the same button stays and only its label changes to «다시 시도»; put the error sentence above it. When there is nothing more to load, do not render the button at all (control it with the cursor / hasMore flag).
