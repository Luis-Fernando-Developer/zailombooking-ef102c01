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
      },
      headers: {
        'x-company-id': company_id,
        'x-service-id': service_id,
        'x-employee-id': employee_id,
        'x-date': date
      }
    });

    if (error) {
      console.error("Supabase function error:", error);
      throw new Error(error.message || "Error fetching availability");
    }
    return data;
  } catch (error: any) {
    console.error("Error calling get-availability:", error);
    return { slots: [], error: error.message };
  }
};