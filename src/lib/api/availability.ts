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
    // 1. Get service duration
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('duration')
      .eq('id', service_id)
      .maybeSingle();

    if (serviceError) {
      console.error("Service fetch error:", serviceError);
      return { slots: [], error: 'Service not found' };
    }

    const duration = service?.duration || 30;

    // 2. Get business hours for the day
    const dayOfWeek = new Date(date).getUTCDay();
    const { data: bizHours, error: bizError } = await supabase
      .from('business_hours')
      .select('*')
      .eq('company_id', company_id)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (bizError || !bizHours || bizHours.is_closed) {
      return { slots: [] };
    }

    // 3. Get employee schedule
    const { data: empSchedule, error: empSchError } = await supabase
      .from('employee_schedules')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (empSchError || !empSchedule || !empSchedule.is_working) {
      return { slots: [] };
    }

    // Determine working interval (intersection of business hours and employee schedule)
    const startTime = empSchedule.start_time > bizHours.open_time ? empSchedule.start_time : bizHours.open_time;
    const endTime = empSchedule.end_time < bizHours.close_time ? empSchedule.end_time : bizHours.close_time;

    // 4. Get existing bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('employee_id', employee_id)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)
      .not('status', 'eq', 'cancelled');

    // 5. Get blocked slots
    const { data: blocked, error: blockedError } = await supabase
      .from('blocked_slots')
      .select('start_time, end_time')
      .eq('employee_id', employee_id)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`);

    // 6. Generate slots
    const slots = [];
    let current = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    // If it's today, filter out past slots
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    while (current.getTime() + duration * 60000 <= end.getTime()) {
      const slotStart = current.toISOString();
      const slotEnd = new Date(current.getTime() + duration * 60000).toISOString();

      // Check if slot is in the past
      if (date === today && current.getTime() <= now.getTime()) {
        current = new Date(current.getTime() + 30 * 60000);
        continue;
      }

      const isBooked = bookings?.some(b => {
        const bStart = new Date(b.start_time).toISOString();
        const bEnd = new Date(b.end_time).toISOString();
        return (slotStart < bEnd && slotEnd > bStart);
      });

      const isBlocked = blocked?.some(b => {
        const bStart = new Date(b.start_time).toISOString();
        const bEnd = new Date(b.end_time).toISOString();
        return (slotStart < bEnd && slotEnd > bStart);
      });

      if (!isBooked && !isBlocked) {
        slots.push(current.toTimeString().substring(0, 5));
      }

      current = new Date(current.getTime() + 30 * 60000); // Increment by 30 mins
    }

    return { slots };

  } catch (error: any) {
    console.error("Error calculating availability:", error);
    return { slots: [], error: error.message };
  }
};