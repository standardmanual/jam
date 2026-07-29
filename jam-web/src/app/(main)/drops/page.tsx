import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DropsClient from './DropsClient'

export default async function DropsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <DropsClient />
}
