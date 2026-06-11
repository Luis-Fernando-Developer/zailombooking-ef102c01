
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkPlans() {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
  
  if (error) {
    console.error('Error fetching plans:', error)
    return
  }
  
  console.log('Plans in DB:', JSON.stringify(data, null, 2))
}

checkPlans()
