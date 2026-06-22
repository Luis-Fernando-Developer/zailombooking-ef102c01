import { format, eachDayOfInterval, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabaseClient";
import { fetchScheduleEntries, ScheduleRow, ScheduleEntry } from "@/lib/api/schedules";

export type ExportFormat = "xlsx" | "csv" | "ods" | "pdf";
export type NameFormat = "first" | "second" | "last" | "full" | "nickname";

export interface ExportOptions {
  nameFormat: NameFormat;
  includeHours: boolean;
}

interface Emp { id: string; name: string; nickname?: string | null }

function formatEmployeeName(emp: Emp, mode: NameFormat): string {
  const parts = (emp.name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  switch (mode) {
    case "first": return first;
    case "second": return second || first;
    case "last": return last || first;
    case "full": return emp.name ?? "";
    case "nickname": return (emp.nickname && emp.nickname.trim()) || [first, second].filter(Boolean).join(" ");
  }
}

async function buildMatrix(schedule: ScheduleRow, tenantId: string, opts: ExportOptions) {
  // Select * tolerantly so we get `nickname` if/when the column exists.
  const [empsRes, entries] = await Promise.all([
    supabase.from("employees").select("*").eq("company_id", tenantId).eq("is_active", true).order("name"),
    fetchScheduleEntries(schedule.id),
  ]);
  const employees = ((empsRes.data ?? []) as any[]).map((e) => ({
    id: e.id, name: e.name, nickname: e.nickname ?? null,
  })) as Emp[];

  const days = eachDayOfInterval({ start: parseISO(schedule.period_start), end: parseISO(schedule.period_end) });
  const entryMap = new Map<string, ScheduleEntry>();
  entries.forEach((e) => entryMap.set(`${e.employee_id}|${e.entry_date}`, e));
  const ids = new Set(entries.map((e) => e.employee_id));
  const visible = entries.length === 0 ? employees : employees.filter((e) => ids.has(e.id));

  const header = ["Colaborador", ...days.map((d) => format(d, "dd/MM"))];
  const rows = visible.map((emp) => [
    formatEmployeeName(emp, opts.nameFormat),
    ...days.map((d) => {
      const e = entryMap.get(`${emp.id}|${format(d, "yyyy-MM-dd")}`);
      if (!e) return "";
      if (e.entry_type === "T") {
        if (!opts.includeHours) return "T";
        const s = e.start_time?.slice(0, 5) ?? "";
        const t = e.end_time?.slice(0, 5) ?? "";
        return s && t ? `${s}-${t}` : "T";
      }
      return e.entry_type;
    }),
  ]);
  return { header, rows };
}

function safeName(s: string) {
  return s.replace(/[^\w.-]+/g, "_");
}

function computeColWidths(header: string[], rows: string[][]): number[] {
  return header.map((h, i) => {
    let max = String(h).length;
    for (const r of rows) {
      const v = r[i] != null ? String(r[i]) : "";
      if (v.length > max) max = v.length;
    }
    return Math.min(Math.max(max + 2, 6), 40);
  });
}

export async function exportSchedule(
  schedule: ScheduleRow,
  tenantId: string,
  fmt: ExportFormat,
  opts: ExportOptions,
) {
  const { header, rows } = await buildMatrix(schedule, tenantId, opts);
  const fileBase = `escala_${safeName(schedule.name)}`;

  if (fmt === "pdf") {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(12);
    doc.text(`${schedule.name}  (${schedule.period_start} → ${schedule.period_end})`, 40, 30);
    autoTable(doc, {
      head: [header],
      body: rows,
      startY: 45,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20 },
      columnStyles: { 0: { cellWidth: 90, fontStyle: "bold" } },
    });
    doc.save(`${fileBase}.pdf`);
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const widths = computeColWidths(header, rows);
  (ws as any)["!cols"] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Escala");
  const bookType = fmt === "xlsx" ? "xlsx" : fmt === "csv" ? "csv" : "ods";
  XLSX.writeFile(wb, `${fileBase}.${fmt}`, { bookType: bookType as XLSX.BookType });
}
