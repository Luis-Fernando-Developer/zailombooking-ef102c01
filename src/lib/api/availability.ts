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
    const { data, error } = await supabase.functions.invoke('get-availability', {
      body: {
        company_id,
        service_id,
        employee_id,
        date
      }
    });

    if (error) {
      // If it's a specific function error, we still want to return empty slots
      console.warn("Supabase function error (handled):", error);
      return { slots: [], error: error.message };
    }
    return data;
  } catch (error: any) {
    console.error("Critical error calling get-availability:", error);
    return { slots: [], error: error.message };
  }
};