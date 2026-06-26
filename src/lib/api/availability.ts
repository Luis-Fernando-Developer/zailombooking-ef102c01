import { supabase } from "@/lib/supabaseClient";

export interface GetAvailabilityParams {
  company_id: string;
  service_id: string;
  employee_id: string;
  date: string;
}

interface AvailabilityResult {
  slots: string[];
  reason: string | null;
  error?: string;
}

interface AvailabilityRow {
  slot: string | null;
  reason: string | null;
}

const normalizeSlots = (rows: AvailabilityRow[] | null | undefined): AvailabilityResult => {
  const normalizedRows = rows ?? [];
  const slots = normalizedRows
    .filter((row) => row.slot)
    .map((row) => String(row.slot).substring(0, 5));

  return {
    slots,
    reason: slots.length === 0 ? normalizedRows[0]?.reason ?? 'no_slots' : null,
  };
};

const callAvailabilityRpc = async ({
  company_id,
  service_id,
  employee_id,
  date,
}: GetAvailabilityParams): Promise<AvailabilityResult> => {
  const { data, error } = await supabase.rpc('get_available_slots', {
    p_company: company_id,
    p_employee: employee_id,
    p_service: service_id,
    p_date: date,
  });

  if (error) {
    console.error('Error calling get_available_slots RPC:', error);
    return { slots: [], reason: 'rpc_error', error: error.message };
  }

  return normalizeSlots(data as AvailabilityRow[] | null);
};

export const getAvailability = async (params: { data: GetAvailabilityParams }) => {
  const { company_id, service_id, employee_id, date } = params.data;

  try {
    const rpcResult = await callAvailabilityRpc({ company_id, service_id, employee_id, date });
    if (!rpcResult.error) return rpcResult;

    const { data, error } = await supabase.functions.invoke('get-availability', {
      body: { company_id, service_id, employee_id, date }
    });

    if (error) {
      console.error("Error calling get-availability edge function:", error);
      return rpcResult;
    }

    return {
      slots: (data?.slots ?? []) as string[],
      reason: (data?.reason ?? null) as string | null,
    };
  } catch (error) {
    console.error("Error calculating availability:", error);
    return {
      slots: [] as string[],
      reason: 'error' as string | null,
      error: error instanceof Error ? error.message : 'Erro ao consultar disponibilidade',
    };
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
  edge_error: 'Erro ao consultar disponibilidade.',
  error: 'Erro ao consultar disponibilidade.',
  no_slots: 'Sem horários disponíveis nesta data.',
};

