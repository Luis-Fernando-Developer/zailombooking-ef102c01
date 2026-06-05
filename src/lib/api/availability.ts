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
      .select('duration_minutes')
      .eq('id', service_id)
      .maybeSingle();

    if (serviceError) {
      console.error("Service fetch error:", serviceError);
      return { slots: [], error: 'Service not found' };
    }

    const duration = service?.duration_minutes || 30;

    // 2. Check for specific employee availability on this date
    const { data: specificAvail, error: availError } = await supabase
      .from('employee_availability')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('available_date', date)
      .maybeSingle();

    let startTime: string;
    let endTime: string;
    let breakStart: string | null = null;
    let breakEnd: string | null = null;

    if (specificAvail) {
      // Use specific availability if found
      startTime = specificAvail.start_time;
      endTime = specificAvail.end_time;
      breakStart = specificAvail.break_start;
      breakEnd = specificAvail.break_end;
    } else {
      // 3. Get business hours for the day (fallback)
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

      // 4. Get employee schedule (fallback)
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
      startTime = empSchedule.start_time > bizHours.open_time ? empSchedule.start_time : bizHours.open_time;
      endTime = empSchedule.end_time < bizHours.close_time ? empSchedule.end_time : bizHours.close_time;
    }

    // 5. Get existing bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('employee_id', employee_id)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`)
      .not('status', 'eq', 'cancelled');

    // 6. Get blocked slots
    const { data: blocked, error: blockedError } = await supabase
      .from('blocked_slots')
      .select('start_time, end_time')
      .eq('employee_id', employee_id)
      .gte('start_time', `${date}T00:00:00`)
      .lte('start_time', `${date}T23:59:59`);

    // 7. Generate slots
    const slots = [];
    let current = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    // If it's today, filter out past slots
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    while (current.getTime() + duration * 60000 <= end.getTime()) {
      const slotStart = current.toISOString();
      const slotEnd = new Date(current.getTime() + duration * 60000).toISOString();
      const currentFormatted = current.toTimeString().substring(0, 5);

      // Check if slot is in the past
      if (date === today && current.getTime() <= now.getTime()) {
        current = new Date(current.getTime() + 30 * 60000);
        continue;
      }

      // Check if slot is during a break
      if (breakStart && breakEnd) {
        if (currentFormatted >= breakStart && currentFormatted < breakEnd) {
          current = new Date(current.getTime() + 30 * 60000);
          continue;
        }

        // Also check if the service would overlap with the break
        const slotEndFormatted = new Date(current.getTime() + (duration - 1) * 60000).toTimeString().substring(0, 5);
        if (slotEndFormatted >= breakStart && slotEndFormatted < breakEnd) {
          current = new Date(current.getTime() + 30 * 60000);
          continue;
        }
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
        slots.push(currentFormatted);
      }

      current = new Date(current.getTime() + 30 * 60000); // Increment by 30 mins
    }

    return { slots };

  } catch (error: any) {
    console.error("Error calculating availability:", error);
    return { slots: [], error: error.message };
  }
};