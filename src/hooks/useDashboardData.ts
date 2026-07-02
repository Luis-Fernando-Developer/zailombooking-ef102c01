import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DashboardData {
  // Group 1
  bookingsCount: number;
  revenue: number;
  newClients: number;
  avgTicket: number;
  // Group 2
  cancellations: number;
  attendanceRate: number;
  avgDurationMinutes: number;
  // Group 3
  receivedPix: number;
  receivedCard: number;
  receivedCash: number;
  // Group 4
  toRepayAutonomous: number;
  toReceiveFromAutonomous: number;
  // Group 5
  statusCounts: Record<string, number>;
  // Group 6
  topEmployeeByRevenue: { name: string; value: number } | null;
  topEmployeeByCount: { name: string; count: number } | null;
  absentEmployees: number;
  reallocations: number;
  // Group 7
  mostSoldService: { name: string; count: number } | null;
  leastSoldService: { name: string; count: number } | null;
  // Group 8
  topSpender: { name: string; value: number } | null;
  mostFrequent: { name: string; count: number } | null;
  inactiveClients: number;
}

const empty: DashboardData = {
  bookingsCount: 0,
  revenue: 0,
  newClients: 0,
  avgTicket: 0,
  cancellations: 0,
  attendanceRate: 0,
  avgDurationMinutes: 0,
  receivedPix: 0,
  receivedCard: 0,
  receivedCash: 0,
  toRepayAutonomous: 0,
  toReceiveFromAutonomous: 0,
  statusCounts: {},
  topEmployeeByRevenue: null,
  topEmployeeByCount: null,
  absentEmployees: 0,
  reallocations: 0,
  mostSoldService: null,
  leastSoldService: null,
  topSpender: null,
  mostFrequent: null,
  inactiveClients: 0,
};

// Days without booking before considered inactive
const INACTIVE_DAYS = 60; // TODO: make this a company setting

function fmt(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function useDashboardData(companyId: string | null, range: DateRange) {
  const [data, setData] = useState<DashboardData>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;


    async function fetchAll() {
      setLoading(true);
      const from = fmt(range.from);
      const to = fmt(range.to);

      try {
        const [
          bookingsRes,
          clientsRes,
          absencesRes,
          reallocRes,
        ] = await Promise.all([
          // All bookings in range with joins
          supabase
            .from("bookings")
            .select(
              "id, booking_status, start_time, end_time, booking_date, payment_method, service:services(name, price), employee:employees(id, name, employee_type, payout_flow_override)"
            )
            .eq("company_id", companyId)
            .gte("booking_date", from)
            .lte("booking_date", to),

          // Clients created in period
          supabase
            .from("clients")
            .select("id, created_at")
            .eq("company_id", companyId)
            .gte("created_at", from)
            .lte("created_at", to + "T23:59:59"),

          // Employee absences overlapping period
          supabase
            .from("employee_absences")
            .select("id")
            .eq("company_id", companyId)
            .lte("start_date", to)
            .gte("end_date", from),

          // Reallocations
          supabase
            .from("booking_reallocations")
            .select("id")
            .eq("company_id", companyId)
            .gte("created_at", from)
            .lte("created_at", to + "T23:59:59"),
        ]);

        if (cancelled) return;

        const bookings: any[] = bookingsRes.data ?? [];
        if (bookingsRes.error) console.error("bookings error", bookingsRes.error);

        // -- Group 1 --
        const activeBookings = bookings.filter((b) =>
          ["confirmed", "completed"].includes(b.booking_status)
        );
        const revenue = activeBookings.reduce(
          (s, b) => s + Number(b.service?.price ?? 0),
          0
        );
        const completedCount = bookings.filter(
          (b) => b.booking_status === "completed"
        ).length;
        const avgTicket =
          activeBookings.length > 0 ? revenue / activeBookings.length : 0;

        // -- Group 2 --
        const cancelledCount = bookings.filter(
          (b) => b.booking_status === "cancelled"
        ).length;
        const noShow = bookings.filter(
          (b) => b.booking_status === "no_show"
        ).length;
        const attendanceDenominator = completedCount + noShow;
        const attendanceRate =
          attendanceDenominator > 0
            ? Math.round((completedCount / attendanceDenominator) * 100)
            : 0;

        const completedWithTimes = bookings.filter(
          (b) =>
            b.booking_status === "completed" && b.start_time && b.end_time
        );
        let avgDuration = 0;
        if (completedWithTimes.length > 0) {
          const totalMins = completedWithTimes.reduce((s, b) => {
            try {
              const start = new Date(`1970-01-01T${b.start_time}`);
              const end = new Date(`1970-01-01T${b.end_time}`);
              return s + (end.getTime() - start.getTime()) / 60000;
            } catch {
              return s;
            }
          }, 0);
          avgDuration = Math.round(totalMins / completedWithTimes.length);
        }

        // -- Group 3: payment method --
        // Try booking_payments table first, then payments, then column
        let pixAmt = 0,
          cardAmt = 0,
          cashAmt = 0;

        const tryPaymentTable = async (tableName: string): Promise<boolean> => {
          try {
            const { data: pmts, error } = await supabase
              .from(tableName as "booking_payments")
              .select("payment_method, amount")
              .eq("company_id", companyId)
              .gte("created_at", from)
              .lte("created_at", to + "T23:59:59");
            if (error) return false;
            if (!pmts || pmts.length === 0) return false;
            for (const p of pmts as any[]) {
              const amt = Number(p.amount ?? 0);
              if (p.payment_method === "pix") pixAmt += amt;
              else if (
                p.payment_method === "credit_card" ||
                p.payment_method === "debit_card" ||
                p.payment_method === "card"
              )
                cardAmt += amt;
              else if (p.payment_method === "cash") cashAmt += amt;
            }
            return true;
          } catch {
            return false;
          }
        };

        const gotPayments =
          (await tryPaymentTable("booking_payments")) ||
          (await tryPaymentTable("payments"));

        if (!gotPayments) {
          // fallback: use bookings.payment_method column
          for (const b of activeBookings) {
            const amt = Number(b.service?.price ?? 0);
            if (b.payment_method === "pix") pixAmt += amt;
            else if (
              b.payment_method === "credit_card" ||
              b.payment_method === "debit_card" ||
              b.payment_method === "card"
            )
              cardAmt += amt;
            else if (b.payment_method === "cash") cashAmt += amt;
          }
        }

        // -- Group 4: autonomous repasses --
        let toRepay = 0,
          toReceive = 0;
        for (const b of activeBookings) {
          const emp = b.employee as any;
          if (!emp || emp.employee_type !== "autonomo") continue;
          const price = Number(b.service?.price ?? 0);
          const flow = emp.payout_flow_override ?? null;
          if (flow === "via_company") {
            // Company collects, owes commission to autonomous
            toRepay += price * 0.5; // TODO: use actual commission rate
          } else if (flow === "direct_to_autonomous") {
            // Autonomous collects, owes % to company
            toReceive += price * 0.3; // TODO: use actual commission rate
          }
        }

        // -- Group 5: status counts --
        const statusCounts: Record<string, number> = {};
        for (const b of bookings) {
          statusCounts[b.booking_status] =
            (statusCounts[b.booking_status] ?? 0) + 1;
        }

        // -- Group 6: team --
        const empRevMap: Record<string, { name: string; value: number }> = {};
        const empCntMap: Record<string, { name: string; count: number }> = {};
        for (const b of activeBookings) {
          const emp = b.employee as any;
          if (!emp) continue;
          const id = emp.id;
          const price = Number(b.service?.price ?? 0);
          if (!empRevMap[id]) empRevMap[id] = { name: emp.name, value: 0 };
          empRevMap[id].value += price;
          if (!empCntMap[id]) empCntMap[id] = { name: emp.name, count: 0 };
          empCntMap[id].count += 1;
        }
        const topByRevenue =
          Object.values(empRevMap).sort((a, b) => b.value - a.value)[0] ??
          null;
        const topByCount =
          Object.values(empCntMap).sort((a, b) => b.count - a.count)[0] ??
          null;

        const absentEmployees = (absencesRes as any)?.data?.length ?? 0;
        const reallocations = (reallocRes as any)?.data?.length ?? 0;

        // -- Group 7: services --
        const svcMap: Record<string, { name: string; count: number }> = {};
        for (const b of bookings) {
          const svc = b.service as any;
          if (!svc) continue;
          const key = svc.name;
          if (!svcMap[key]) svcMap[key] = { name: key, count: 0 };
          svcMap[key].count += 1;
        }
        const svcArr = Object.values(svcMap).sort((a, b) => b.count - a.count);
        const mostSoldService = svcArr[0] ?? null;
        const leastSoldService = svcArr[svcArr.length - 1] ?? null;

        // -- Group 8: clients --
        // Top spender + most frequent: from bookings in range
        const clientSpend: Record<string, { name: string; value: number }> = {};
        const clientFreq: Record<string, { name: string; count: number }> = {};

        // We need client info from bookings — re-query with client join
        const { data: clientBookings } = await supabase
          .from("bookings")
          .select(
            "client_id, booking_status, service:services(price), client:clients(name)"
          )
          .eq("company_id", companyId)
          .gte("booking_date", from)
          .lte("booking_date", to)
          .in("booking_status", ["confirmed", "completed"]);

        for (const b of clientBookings ?? []) {
          const cid = (b as any).client_id;
          const cname = (b as any).client?.name ?? "—";
          const price = Number((b as any).service?.price ?? 0);
          if (!clientSpend[cid])
            clientSpend[cid] = { name: cname, value: 0 };
          clientSpend[cid].value += price;
          if (!clientFreq[cid])
            clientFreq[cid] = { name: cname, count: 0 };
          clientFreq[cid].count += 1;
        }

        const topSpender =
          Object.values(clientSpend).sort((a, b) => b.value - a.value)[0] ??
          null;
        const mostFrequent =
          Object.values(clientFreq).sort((a, b) => b.count - a.count)[0] ??
          null;

        // Inactive: clients whose last booking is > INACTIVE_DAYS ago
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);
        const cutoffStr = fmt(cutoff);
        const { count: inactiveClients } = await supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .lt("last_booking_date", cutoffStr);
        // Fallback gracefully if column doesn't exist

        if (cancelled) return;

        setData({
          bookingsCount: bookings.length,
          revenue,
          newClients: (clientsRes.data ?? []).length,
          avgTicket,
          cancellations: cancelledCount,
          attendanceRate,
          avgDurationMinutes: avgDuration,
          receivedPix: pixAmt,
          receivedCard: cardAmt,
          receivedCash: cashAmt,
          toRepayAutonomous: toRepay,
          toReceiveFromAutonomous: toReceive,
          statusCounts,
          topEmployeeByRevenue: topByRevenue,
          topEmployeeByCount: topByCount,
          absentEmployees,
          reallocations,
          mostSoldService,
          leastSoldService,
          topSpender,
          mostFrequent,
          inactiveClients: inactiveClients ?? 0,
        });
      } catch (err) {
        console.error("useDashboardData error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [companyId, range.from, range.to]);

  // TODO: comparação com período anterior
  // const previousRange = computePreviousRange(range);
  // const previousData = useDashboardData(companyId, previousRange);

  return { data, loading };
}
