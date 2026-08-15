Center-screen modal variant of Toast — backdrop + centered card with a circular icon badge. Use for emphasis moments (badge earned, mission complete) rather than passive status (use `Toast` for those).

```jsx
<ModalToast message="배지를 받았어요" type="success" open={show} onDismiss={() => setShow(false)} />
```
