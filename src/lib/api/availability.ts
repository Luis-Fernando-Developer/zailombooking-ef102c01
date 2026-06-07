import { supabase } from "@/lib/supabaseClient";

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
      console.error("Error calling get-availability edge function:", error);
      return { slots: [], error: error.message };
    }

    return { slots: data?.slots || [] };

  } catch (error: any) {
    console.error("Error calculating availability:", error);
    return { slots: [], error: error.message };
  }
};
