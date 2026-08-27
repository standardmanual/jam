---
id: 20260806_002
category: Infra
status: CLOSED
created: 2026-08-06
closed: 2026-08-06
---

# [Infra] 서비스 도메인 전환: jam-rose.app → j-a-m.app

## 배경 / 문제 정의
GoDaddy에서 `j-a-m.app` 도메인을 구매하고 Vercel DNS 설정 완료. 기존 `jam-rose.app`에서 신규 도메인으로 전면 전환 필요. 소스코드·환경변수·외부 서비스(OAuth, 지도 API 등)에 하드코딩된 도메인을 모두 업데이트해야 함.

## 상세 요구사항

### 서비스/코드베이스 관점
- Vercel 환경변수 `NEXT_PUBLIC_BASE_URL` 신규 추가 (`https://j-a-m.app`)
- 로컬 `.env.local`에도 동일 변수 추가
- Strava 콜백 URI가 `NEXT_PUBLIC_BASE_URL` 기반으로 동적 구성되는지 확인
- Supabase Auth 허용 redirect URL에 `j-a-m.app` 추가
- GitHub OAuth 콜백 URL 업데이트 (해당 시)

### 외부 서비스 관점
- Google Cloud Console: 승인된 리디렉션 URI에 `https://j-a-m.app` 관련 경로 추가
- Strava API: 콜백 도메인 업데이트
- Naver 지역검색 API: 허용 도메인 업데이트
- Naver 지도(NCP): 허용 도메인 업데이트

## 구현 계획
1. Vercel env 추가 → 재배포
2. 코드 내 하드코딩된 도메인 grep 후 `NEXT_PUBLIC_BASE_URL` 환경변수로 치환
3. 외부 서비스 콘솔에서 직접 설정 (수동)

---
## 완료 기록

### 구현 내용 요약
`NEXT_PUBLIC_BASE_URL=https://j-a-m.app` Vercel + 로컬 환경변수 추가 완료. 불필요해진 `STRAVA_REDIRECT_URI` 환경변수 삭제. 외부 서비스(Strava, Naver 지역검색, Naver 지도) 도메인 사용자 직접 설정 완료. 재배포 및 기능 테스트 완료.

### 변경된 파일
```
jam-web/.env.local           ← NEXT_PUBLIC_BASE_URL 추가
Vercel 환경변수              ← NEXT_PUBLIC_BASE_URL 추가, STRAVA_REDIRECT_URI 삭제
```

### 테스트 결과
- [x] Strava OAuth 연동 동작 확인
- [x] Google 로그인 동작 확인
- [x] Naver 지도 렌더링 확인
- [x] Naver 장소 검색 확인
- [x] Supabase Auth 콜백 정상 처리 확인

### 배포 정보
- 배포일: 2026-08-06
- 환경: production (Vercel)
- 커밋: Vercel env 변경 후 `vercel --prod` 재배포

### 주요 의사결정 / 핵심 메모
- **`NEXT_PUBLIC_BASE_URL` Vercel 등록 시 `branch_not_found` 오류**: 동일 변수가 이미 존재해서 발생. `vercel env rm` 후 재등록으로 해결.
- **`STRAVA_REDIRECT_URI` 환경변수 잔재 발견**: 27일 전부터 코드에서 미사용 중인 변수였음. 이번 기회에 `vercel env rm STRAVA_REDIRECT_URI production`으로 정리.
- **`vercel env pull`로 GOOGLE_CLIENT_ID 값 확인 불가**: Vercel의 encrypted 변수는 pull 시 빈 문자열로 표시되는 정상 동작. 실제 값은 Vercel에 존재.
- Supabase Auth의 허용 redirect URL: `j-a-m.app/**` 와일드카드 패턴으로 등록. 기존 `jam-rose.app` 경로는 잠시 병존 후 추후 정리 예정.

### 잔여 이슈
- 기존 `jam-rose.app` 도메인은 Vercel에 연결된 채로 유지 (신규 접속 시 j-a-m.app으로 리디렉트 설정 검토 가능)
- Supabase Auth의 `jam-rose.app` redirect URL 항목 정리 미완
