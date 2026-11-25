Bottom-anchored transient message, dark pill, auto-dismiss handled by the caller.

```jsx
<Toast message="배지를 받았어요" type="success" open={show} onDismiss={() => setShow(false)} />
```

## 놓는 위치

토스트는 플로팅 탭바 바로 위에 붙인다. 컨테이너에 `position: fixed; bottom: var(--toast-bottom)`을 주고, 숫자를 직접 적지 않는다.
`--toast-bottom`은 탭바 윗면에서 8px 위(`--tabbar-bottom` + `--tabbar-height` + 8px)이고, 가로폭은 탭바와 같다(좌우 21px, 최대 388px).
바텀시트처럼 하단을 점유하는 UI가 열려 있으면 그 위로 올려 띄운다(서비스 `ToastProvider`가 처리한다).
