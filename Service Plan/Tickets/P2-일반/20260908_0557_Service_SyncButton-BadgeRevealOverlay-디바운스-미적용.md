---
id: 20260908_0557
category: Service
priority: P2
status: OPEN
created: 2026-09-08
---

# [Service] SyncButton의 BadgeRevealOverlay 디바운스 미적용

## 배경 / 문제 정의
[20260908_0544](../P1-중요/20260908_0544_Service_eye-loader-과다노출및NavigationLoader고착-수정.md)에서
`useDebouncedLoading` 훅을 만들어 `MissionStatusClient`·`BadgeShareButton`·`StravaConnectReveal`
세 곳에 적용했지만, `BadgeRevealOverlay`의 네 번째 호출부인 `SyncButton.tsx`는 티켓 범위 밖이라
손대지 않았다. `SyncButton.tsx`는 `loading` prop 자체를 넘기지 않고 `open`만 즉시 토글하고
있어, 빠르게 끝나는 동기화 요청에도 eye loader가 스치듯 노출될 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `jam-web/src/components/SyncButton.tsx`의 로딩 상태에도 `useDebouncedLoading`
  (`jam-web/src/hooks/useDebouncedLoading.ts`) 훅을 적용해, 다른 세 곳과 동일한 디바운스
  정책(SHOW_DELAY_MS/MIN_VISIBLE_MS/MAX_VISIBLE_MS)을 따르게 한다.

## 구현 계획
`MissionStatusClient.tsx`·`BadgeShareButton.tsx`에 적용한 패턴(실제 결과 준비 여부를 먼저
확인한 뒤 훅 값으로 폴백)을 그대로 따른다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 잔여 이슈
-
