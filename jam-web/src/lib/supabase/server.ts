/**
 * Supabase 서버 클라이언트
 * 서버 컴포넌트 / API Routes / Server Actions에서 사용
 * 쿠키 기반 세션 관리 (SSR)
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 서버 컴포넌트에서 호출 시 무시 (읽기 전용 컨텍스트)
          }
        },
      },
    }
  )
}

/**
 * Supabase 서비스 롤 클라이언트
 * 서버 사이드 전용 (배지 발급, Strava 토큰 저장 등 RLS 우회 필요 시)
 * 클라이언트에 절대 노출 금지
 */
export function createServiceClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
