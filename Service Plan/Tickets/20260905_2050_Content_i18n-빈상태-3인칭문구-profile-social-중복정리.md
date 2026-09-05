---
id: 20260905_2050
category: Content
status: IN_PROGRESS
created: 2026-09-05
closed:
---

# [Content] i18n 빈 상태 3인칭 문구 profile/social 네임스페이스 중복 정리

## 배경 / 문제 정의

`jam-web/src/lib/i18n/ko.ts`에 3인칭(타인 시점) 빈 상태 문구가 두 네임스페이스에
바이트 단위로 동일하게 중복 정의돼 있다.

- `profile` 네임스페이스 (프로필 화면 4탭용, 티켓 20260903_2022): `emptyFollowersOther`,
  `emptyFollowingOther` — `ProfileClient.tsx`에서 사용
- `social` 네임스페이스 (`/{username}/followers`, `/{username}/following` 전체 페이지용,
  티켓 20260905_2039): 같은 두 문구를 다시 정의 — `followers/page.tsx`, `following/page.tsx`에서 사용

두 네임스페이스는 "본인 시점" 문구가 서로 달라서(profile: '아직 팔로잉이 없어요' vs
social: '아직 팔로우한 사람이 없어요') 완전 통합은 불가능하지만, "타인 시점" 문구만은
우연히 텍스트가 완전히 일치한다. conservative-reviewer가 티켓 20260905_2039 리뷰 중
side finding으로 지적했다 — 이대로 두면 향후 한쪽만 수정되고 다른 쪽은 놓치는 불일치
위험이 있다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `emptyFollowersOther` / `emptyFollowingOther` 두 문자열을 `ko.ts` 모듈 상단에
  공유 상수로 선언하고, `profile`·`social` 두 네임스페이스에서 그 상수를 참조하도록 변경한다.
- "본인 시점" 문구(`emptyFollowers`/`emptyFollowersBody`/`emptyFollowing`/`emptyFollowingBody`)는
  네임스페이스별로 이미 다르므로 그대로 둔다 — 억지로 통합하지 않는다.
- 순수 리팩터링이다. 렌더링되는 문구·동작은 변경하지 않는다.

## 구현 계획

1. `ko.ts` 상단(namespace 객체 밖)에 `EMPTY_FOLLOWERS_OTHER`, `EMPTY_FOLLOWING_OTHER` 상수 선언.
2. `profile.emptyFollowersOther`/`emptyFollowingOther`, `social.emptyFollowersOther`/`emptyFollowingOther`가
   각각 그 상수를 참조하도록 교체.
3. `tsc --noEmit`으로 타입 확인 (동작 변경 없으므로 별도 브라우저 검증 불요).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`ko.ts` 상단에 `EMPTY_FOLLOWERS_OTHER`/`EMPTY_FOLLOWING_OTHER` 공유 상수를 선언하고
`profile`·`social` 두 네임스페이스가 이를 참조하도록 변경. 문구·렌더링 동작 변화 없음.

### 변경된 파일
```
jam-web/src/lib/i18n/ko.ts
```

### 테스트 결과
- [x] `tsc --noEmit` 통과 확인

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
문구 자체는 변경하지 않는 순수 리팩터링이므로 해당 없음 (기존 문구는 티켓 20260903_2022,
20260905_2039에서 이미 검증됨).

### 배포 정보
- 배포일:
- 환경: staging (git push origin staging)
- 커밋:

### 주요 의사결정 / 핵심 메모
- "타인 시점" 문구만 상수로 공유하고 "본인 시점" 문구는 통합하지 않음 — 두 네임스페이스의
  본인 시점 문구가 의도적으로 다르기 때문 (profile은 프로필 화면 4탭, social은 팔로워/팔로잉
  전체 페이지 전용 톤).
- 주석만 남기는 방안(상수화하지 않고 "동기화 필요" 코멘트만 추가) 대신 실제 공유 상수로
  묶는 방안을 택함 — 컴파일 타임에 불일치를 원천 차단할 수 있고 비용이 낮기 때문.

### 잔여 이슈
-
