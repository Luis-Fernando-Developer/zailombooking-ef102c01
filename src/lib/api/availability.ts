import { supabase } from "@/lib/supabaseClient";

export interface GetAvailabilityParams {
  company_id: string;
  service_id: string;
  employee_id: string;
  date: string;
}

export const getAvailability = async (params: { data: GetAvailabilityParams }) => {
  const { company_id, service_id, employee_id, date } = params.data;
  
  const { data, error } = await supabase.functions.invoke('get-availability', {
    body: { company_id, service_id, employee_id, date }
  });

  if (error) {
    console.error("Error calling get-availability function:", error);
    return { slots: [], error: error.message };
  }

  return data;
};
