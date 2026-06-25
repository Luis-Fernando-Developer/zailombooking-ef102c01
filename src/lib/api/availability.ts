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
      body: { company_id, service_id, employee_id, date }
    });

    if (error) {
      console.error("Error calling get-availability edge function:", error);
      return { slots: [] as string[], reason: 'error' as string | null, error: error.message };
    }

    return {
      slots: (data?.slots ?? []) as string[],
      reason: (data?.reason ?? null) as string | null,
    };
  } catch (error: any) {
    console.error("Error calculating availability:", error);
    return { slots: [] as string[], reason: 'error' as string | null, error: error.message };
  }
};

export const AVAILABILITY_REASON_LABELS: Record<string, string> = {
  no_schedule_published: 'Ainda não há escala publicada para esta data. Tente outra data ou aguarde a publicação.',
  no_entry: 'O profissional não possui escala definida para este dia.',
  off_F: 'Folga do profissional.',
  off_A: 'Profissional ausente neste dia.',
  off_FE: 'Profissional em férias.',
  off_D: 'Profissional desligado.',
  off_DO: 'Day-off do profissional.',
  terminated: 'Profissional desligado.',
  absence: 'Profissional em ausência/férias/atestado.',
  company_closed: 'Empresa fechada neste dia.',
  past_date: 'Data já passada.',
  beyond_max_advance: 'Data fora da janela permitida para agendamento.',
  employee_not_found: 'Profissional não encontrado.',
  service_not_found: 'Serviço não encontrado.',
  rpc_error: 'Erro ao consultar disponibilidade.',
  error: 'Erro ao consultar disponibilidade.',
  no_slots: 'Sem horários disponíveis nesta data.',
};

