
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function seedPlans() {
  const dummyPlans = [
    { 
      name: 'Starter', 
      monthly_price: 79, 
      quarterly_price: 213, 
      annual_price: 708,
      is_active: true, 
      features: [
        '200 agendamentos por Mes',
        '1 profissional',
        '5 serviços',
        '1 Chatbot básico',
        '1 conexão para whatsapp',
        '700 Mensagens por mes',
        'Suporte por email'
      ] 
    },
    { 
      name: 'Professional', 
      monthly_price: 149, 
      quarterly_price: 402, 
      annual_price: 1308,
      is_active: true, 
      features: [
        '700 Agendamentos por mes',
        'Até 5 profissionais',
        'Até 12 serviços',
        '3 Chatbots inclusos',
        '3 conexões para whatsapp',
        '5.000 Mensagens por mes',
        'Relatórios avançados',
        'Suporte prioritário'
      ] 
    },
    { 
      name: 'Enterprise', 
      monthly_price: 249, 
      quarterly_price: 672, 
      annual_price: 2268,
      is_active: true, 
      features: [
        'Agendamentos Ilimitados',
        'Profissionais ilimitados',
        'Serviços Ilimitados',
        'Chatbots Ilimitados',
        'Conexões para whatsapp Ilimitadas',
        'Mensagens por mes Ilimitadas',
        'API Completa',
        'Gerente de conta dedicado'
      ] 
    },
  ];

  console.log('Seeding plans...')
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert(dummyPlans)
    .select()
  
  if (error) {
    console.error('Error seeding plans:', error)
    return
  }
  
  console.log('Plans seeded successfully:', JSON.stringify(data, null, 2))
}

seedPlans()
