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

const LEGEND: Array<[string, string]> = [
  ["T", "Trabalho"],
  ["F", "Folga"],
  ["A", "Ausência"],
  ["FA", "Férias"],
  ["D", "Desligado"],
];

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

async function fetchLogoDataUrl(tenantId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("company_customizations")
      .select("logo_type, logo_url, logo_upload_path")
      .eq("company_id", tenantId)
      .maybeSingle();
    if (!data) return null;
    let url: string | null = null;
    if (data.logo_type === "upload" && data.logo_upload_path) {
      const pub = supabase.storage.from("company-logos").getPublicUrl(data.logo_upload_path);
      url = pub.data.publicUrl;
    } else if (data.logo_url) {
      url = data.logo_url;
    }
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function fetchGeneratedBy(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? data.user?.id ?? "";
}

async function buildMatrix(schedule: ScheduleRow, tenantId: string, opts: ExportOptions) {
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

function formatPeriod(s: string, e: string) {
  return `${format(parseISO(s), "dd/MM/yyyy")} a ${format(parseISO(e), "dd/MM/yyyy")}`;
}

function imgDims(dataUrl: string): Promise<{ w: number; h: number; type: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const type = dataUrl.startsWith("data:image/png") ? "PNG" : dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg") ? "JPEG" : "PNG";
      resolve({ w: img.naturalWidth, h: img.naturalHeight, type });
    };
    img.onerror = () => resolve({ w: 0, h: 0, type: "PNG" });
    img.src = dataUrl;
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
  const period = formatPeriod(schedule.period_start, schedule.period_end);
  const generatedBy = await fetchGeneratedBy();
  const logoDataUrl = await fetchLogoDataUrl(tenantId);

  if (fmt === "pdf") {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;

    // ----- TOP: logo + title + period -----
    let topY = margin;
    if (logoDataUrl) {
      const { w, h, type } = await imgDims(logoDataUrl);
      if (w && h) {
        const targetH = 50;
        const targetW = (w / h) * targetH;
        try { doc.addImage(logoDataUrl, type, margin, topY, targetW, targetH); } catch { /* ignore */ }
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Escala", pageW / 2, topY + 22, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Período: ${period}`, pageW / 2, topY + 42, { align: "center" });

    const tableStartY = topY + 70;

    // ----- BOTTOM block: legend, signatures, generated/approved -----
    const bottomBlockH = 170; // reserved space at bottom
    const tableMaxY = pageH - margin - bottomBlockH;

    autoTable(doc, {
      head: [header],
      body: rows,
      startY: tableStartY,
      margin: { left: margin, right: margin, bottom: bottomBlockH + margin },
      styles: { fontSize: 7, cellPadding: 2, halign: "center", valign: "middle" },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, halign: "center" },
      columnStyles: { 0: { cellWidth: 90, fontStyle: "bold", halign: "left" } },
    });

    // Force bottom block on last page
    const lastY = pageH - margin - bottomBlockH;
    // Legend
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Legenda", margin, lastY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    LEGEND.forEach(([k, v], i) => {
      doc.text(`${k} · ${v}`, margin + i * 110, lastY + 28);
    });

    // Signatures
    const sigY = lastY + 70;
    const sigW = (pageW - margin * 2 - 40) / 2;
    doc.setFontSize(10);
    doc.text("Ass. Encarregado Responsável", margin, sigY);
    doc.line(margin, sigY + 18, margin + sigW, sigY + 18);
    doc.text("Ass. Líder Responsável", margin + sigW + 40, sigY);
    doc.line(margin + sigW + 40, sigY + 18, margin + sigW * 2 + 40, sigY + 18);

    // Generated by / Approved by
    const infoY = lastY + bottomBlockH - 20;
    doc.setFontSize(9);
    doc.text(`Gerado por: ${generatedBy}`, margin, infoY);
    doc.text(`Aprovado por: ____________________________`, pageW - margin, infoY, { align: "right" });

    doc.save(`${fileBase}.pdf`);
    return;
  }

  // ----- Spreadsheet formats: XLSX / CSV / ODS -----
  const cols = header.length;
  const blankRow: string[] = Array(cols).fill("");
  const titleRow = ["Escala", ...Array(cols - 1).fill("")];
  const periodRow = [`Período: ${period}`, ...Array(cols - 1).fill("")];
  const legendRow = ["Legenda:", ...LEGEND.map(([k, v]) => `${k} · ${v}`)];
  // Pad legendRow to cols if needed
  while (legendRow.length < cols) legendRow.push("");

  const sheetData = [
    titleRow,
    periodRow,
    blankRow,
    header,
    ...rows,
    blankRow,
    legendRow,
    blankRow,
    ["Ass. Encarregado Responsável: ____________________________"],
    ["Ass. Líder Responsável: ____________________________"],
    blankRow,
    [`Gerado por: ${generatedBy}`],
    ["Aprovado por: ____________________________"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const widths = computeColWidths(header, rows);
  (ws as any)["!cols"] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Escala");
  const bookType = fmt === "xlsx" ? "xlsx" : fmt === "csv" ? "csv" : "ods";
  XLSX.writeFile(wb, `${fileBase}.${fmt}`, { bookType: bookType as XLSX.BookType });
}
