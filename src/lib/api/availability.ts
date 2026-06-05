import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client for server-side use
// Using VITE_ prefix variables which are available on both client and server in this environment
const supabaseUrl = process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);


export const getAvailability = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    company_id: z.string(),
    service_id: z.string(),
    employee_id: z.string(),
    date: z.string(),
  }))
  .handler(async ({ data }) => {
    const { company_id, service_id, employee_id, date } = data;

    try {
      console.log(`Getting availability for ${date} (Company: ${company_id}, Employee: ${employee_id})`);

      // 1. Get service duration
      const { data: service } = await supabase
        .from('services')
        .select('duration')
        .eq('id', service_id)
        .single();

      const duration = service?.duration || 30;

      // 2. Get business hours
      const dayOfWeek = new Date(date).getUTCDay();
      const { data: bizHours } = await supabase
        .from('business_hours')
        .select('*')
        .eq('company_id', company_id)
        .eq('day_of_week', dayOfWeek)
        .single();

      if (!bizHours || bizHours.is_closed) {
        return { slots: [] };
      }

      // 3. Get employee schedule
      const { data: empSchedule } = await supabase
        .from('employee_schedules')
        .select('*')
        .eq('employee_id', employee_id)
        .eq('day_of_week', dayOfWeek)
        .single();

      if (!empSchedule || !empSchedule.is_working) {
        return { slots: [] };
      }

      // Intersection of times
      const startTime = empSchedule.start_time > bizHours.open_time ? empSchedule.start_time : bizHours.open_time;
      const endTime = empSchedule.end_time < bizHours.close_time ? empSchedule.end_time : bizHours.close_time;

      // 4. Get bookings and blocked slots
      const [bookingsRes, blockedRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('start_time, end_time')
          .eq('employee_id', employee_id)
          .gte('start_time', `${date}T00:00:00`)
          .lte('start_time', `${date}T23:59:59`)
          .not('status', 'eq', 'cancelled'),
        supabase
          .from('blocked_slots')
          .select('start_time, end_time')
          .eq('employee_id', employee_id)
          .gte('start_time', `${date}T00:00:00`)
          .lte('start_time', `${date}T23:59:59`)
      ]);

      const bookings = bookingsRes.data || [];
      const blocked = blockedRes.data || [];

      // 5. Generate slots
      const slots = [];
      let current = new Date(`${date}T${startTime}`);
      const end = new Date(`${date}T${endTime}`);

      while (current.getTime() + duration * 60000 <= end.getTime()) {
        const slotStart = current.toISOString();
        const slotEnd = new Date(current.getTime() + duration * 60000).toISOString();

        const isBusy = [...bookings, ...blocked].some(b => {
          const bStart = new Date(b.start_time).toISOString();
          const bEnd = new Date(b.end_time).toISOString();
          return (slotStart < bEnd && slotEnd > bStart);
        });

        if (!isBusy) {
          slots.push(current.toTimeString().substring(0, 5));
        }

        current = new Date(current.getTime() + 30 * 60000); // 30 min step
      }

      return { slots };
    } catch (error) {
      console.error("Error in getAvailability server function:", error);
      return { slots: [], error: "Internal server error" };
    }
  });
