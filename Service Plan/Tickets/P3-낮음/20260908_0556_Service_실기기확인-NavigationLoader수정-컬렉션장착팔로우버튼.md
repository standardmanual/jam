---
id: 20260908_0556
category: Service
priority: P3
status: OPEN
created: 2026-09-08
---

# [Service] 실기기 확인 — NavigationLoader 수정 후 컬렉션 장착·팔로우 버튼

## 배경 / 문제 정의
[20260908_0544](../P1-중요/20260908_0544_Service_eye-loader-과다노출및NavigationLoader고착-수정.md)에서
`NavigationLoader`의 클릭 리스너를 capture→bubble로 바꿔 컬렉션 장착/해제·팔로우 버튼의 8초
고착 버그를 논리적으로 해결했다고 판단했으나, 격리 워크트리 환경 제약으로 실제 브라우저 실렌더
확인은 하지 못했다(게이트 리뷰 sideFindings에서도 지적됨).

## 상세 요구사항

### 서비스/코드베이스 관점
- staging 병합 후 다음 두 경로를 실기기(또는 로컬 `npm run dev`)에서 직접 클릭해 확인:
  1. `jam-web/src/app/(main)/collections/[id]/SlotGrid.tsx` — 배지 장착/해제 버튼
  2. `jam-web/src/app/(main)/profile/ProfileClient.tsx` — 팔로워/팔로잉 목록의 팔로우 버튼
- 확인 항목: 클릭 시 전체화면 eye loader가 뜨지 않는지, 뜨더라도 정상적으로 즉시 사라지는지

## 구현 계획
코드 변경 없음(검증 전용). 문제가 재현되면 별도 버그 티켓으로 분리한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 테스트 결과
- [ ]

### 잔여 이슈
-
