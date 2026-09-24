/**
 * 유저 목록 정렬 옵션 — 클라이언트 컴포넌트(`UsersFilterBar`)가 값으로 import하므로 서버 전용 모듈(`./auth` 등)에 의존하지 않는다.
 * `user-list.ts`가 서버 쪽 조회에 쓰려고 다시 내보낸다.
 */
export type UserListSort = 'createdAt_desc' | 'createdAt_asc' | 'username_asc' | 'username_desc'

export const DEFAULT_USER_LIST_SORT: UserListSort = 'createdAt_desc'

export const USER_LIST_SORT_OPTIONS: { value: UserListSort; label: string }[] = [
  { value: 'createdAt_desc', label: '가입 최신순' },
  { value: 'createdAt_asc', label: '가입 오래된순' },
  { value: 'username_asc', label: '이름순' },
]
