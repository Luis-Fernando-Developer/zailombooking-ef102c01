
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function updatePlans() {
  const plans = [
    { name: 'Starter', tier: 'starter' },
    { name: 'Professional', tier: 'professional' },
    { name: 'Enterprise', tier: 'enterprise' }
  ]

  for (const plan of plans) {
    const { error } = await supabase
      .from('subscription_plans')
      .update({ builder_tier: plan.tier })
      .eq('name', plan.name)
    
    if (error) console.error(`Error updating ${plan.name}:`, error)
  }
  
  console.log('Plans updated successfully')
}

updatePlans()
