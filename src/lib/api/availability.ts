import { supabase } from "@/lib/supabaseClient";

export interface GetAvailabilityParams {
  company_id: string;
  service_id: string;
  employee_id: string;
  date: string;
}

export const getAvailability = async (params: { data: GetAvailabilityParams }) => {
  const { company_id, service_id, employee_id, date } = params.data;
  
  // Use fetch directly to avoid issues with invoke and preflight response requirements
  const { data: { session } } = await supabase.auth.getSession();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/get-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company_id, service_id, employee_id, date })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error calling availability function:", errorText);
      return { slots: [], error: `HTTP ${response.status}: ${errorText}` };
    }

    return await response.json();
  } catch (error: any) {
    console.error("Fetch error calling get-availability:", error);
    return { slots: [], error: error.message };
  }
};
