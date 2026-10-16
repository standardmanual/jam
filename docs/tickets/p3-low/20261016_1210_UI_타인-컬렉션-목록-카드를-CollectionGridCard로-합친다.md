---
id: "20261016_1210"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2133"
---

# [UI] 타인 컬렉션 목록 카드를 CollectionGridCard로 합친다

## 핵심 요약

- 요구사항: `jam-web/src/app/(main)/[username]/collections/page.tsx:180`의 컬렉션 카드(Card + 정사각 썸네일 + 제목 + ProgressBar + n/m)는 배지 목록·프로필 탭이 쓰는 `CollectionGridCard`와 같은 역할이다. 2133 1회 정비로 두 카드가 같은 흰 면 + 테두리가 되어 차이는 안쪽 여백(Card 24px 대 CollectionGridCard 12px)과 부족한 태그 줄뿐이다. 같은 컬렉션이 화면마다 다른 간격으로 보인다.
- 구현 계획: `CollectionGridCard`에 부제 슬롯 또는 children을 더해 이 카드를 대체하고, 서비스·MODULAR 쌍을 함께 고친다. 이 카드의 완성 칩(`bg-background`)이 새 썸네일 칸(`bg-background-secondary`) 위에서 윤곽이 약 1.07:1인 점(`collections/page.tsx:193`)도 같이 정리한다.
- 근거: 티켓 20261015_2133 1회 채원② 승격 후보.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
