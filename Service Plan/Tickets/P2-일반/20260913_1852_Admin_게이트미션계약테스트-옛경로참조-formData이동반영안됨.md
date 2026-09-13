---
id: 20260913_1852
category: Admin
priority: P2
status: OPEN
created: 2026-09-13
---

# [Admin] 게이트미션 계열 선택지 계약 테스트가 옛 파일 경로를 참조해 실패

## 배경 / 문제 정의

티켓 20260913_1819(쉐이더 랩 재생 기능 제거) 게이트 리뷰 중 `npx vitest run` 전체 실행에서
`src/app/admin/gate-missions/__tests__/gate-family-options-contract.test.ts`(티켓
20260910_2055 AC5 회귀 테스트) 3건이 실패함을 발견했다. 이번 티켓과 무관한 파일이라
범위 밖 발견물로 분리한다.

## 원인

이 테스트는 `page.tsx` 소스 코드를 정규식으로 대조하는 계약 테스트인데, 실제 계열
조립 로직(`.filter((f) => !!f.familyKey || f.adminCategory === 'jam')`,
`familyKey: (f.familyKey ?? f.key)`, `adminCategory: f.adminCategory`)이 어느 시점에
`src/app/admin/gate-missions/page.tsx`에서 `src/app/admin/gate-missions/formData.ts`로
옮겨졌다(`git log`상 관련 최근 커밋: `887e8065`·`2d28f31b`, 정확한 이동 시점은 착수 시
`git log -p`로 재확인 필요).

**실제 기능 회귀는 아니다** — `formData.ts:53-60`에 로직이 그대로 살아 있고 내용도
정확하다(직접 대조 확인). 다만 테스트가 낡은 파일을 보고 있어 앞으로 이 로직이 실제로
깨져도 이 계약 테스트가 감지하지 못하는 상태다.

## 상세 요구사항

- `gate-family-options-contract.test.ts`의 `codeOf('src/app/admin/gate-missions/page.tsx')`를
  `formData.ts`(또는 로직이 실제로 위치한 파일)로 갱신
- 3개 테스트 케이스(필터 조건, familyKey 폴백, adminCategory 전달)가 새 위치 기준으로
  정확히 매칭되는지 확인
- 리팩터링 이력상 이 로직이 또 다른 파일로 옮겨질 수 있으므로, 가능하면 테스트가
  구현 파일 경로가 아니라 로직이 있는 모듈을 안정적으로 찾을 수 있는 방식인지도 함께 검토

## 참고

- 발견 경위: 티켓 20260913_1819 게이트 리뷰(conservative-reviewer)의 sideFinding
- 관련 원본 테스트 의도: 티켓 20260910_2055 AC5 (JAM! 카테고리 배지가 family_key 없이도
  게이트 미션 계열 선택지에 노출돼야 함)
