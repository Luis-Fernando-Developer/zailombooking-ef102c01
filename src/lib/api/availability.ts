import { supabase } from "@/lib/supabaseClient";
import { getEdgeFunctionUrl } from "@/lib/supabaseHelpers";

export interface GetAvailabilityParams {
  company_id: string;
  service_id: string;
  employee_id: string;
  date: string;
}

export const getAvailability = async (params: { data: GetAvailabilityParams }) => {
  const { company_id, service_id, employee_id, date } = params.data;
  
  try {
    const url = getEdgeFunctionUrl('get-availability');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'x-company-id': company_id,
        'x-service-id': service_id,
        'x-employee-id': employee_id,
        'x-date': date
      },
      body: JSON.stringify({
        company_id,
        service_id,
        employee_id,
        date
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Supabase function error text:", errorText);
      throw new Error(`Error fetching availability: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
  } catch (error: any) {
    console.error("Error calling get-availability:", error);
    return { slots: [], error: error.message };
  }
};