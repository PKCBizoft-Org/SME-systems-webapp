// A one-page job report the browser can print or save as PDF: who, what was
// done, the before and after photos, the customer's signature and (for staff
// who may see money) the materials used and what they cost.

export type ReportCostLine = {
  item_name: string;
  unit: string | null;
  qty: number;
  unit_cost: number;
  line_cost: number;
};

export type ReportPhoto = { photo_type: string; url?: string };

export type JobReportInput = {
  customerName: string;
  accountId: string | null;
  address: string | null;
  jobType: string | null;
  status: string;
  technician: string | null;
  jobDate: string | null;
  problem: string;
  resolution: string | null;
  checklist: unknown;
  acceptedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  signedAt: string | null;
  photos: ReportPhoto[];
  costs: ReportCostLine[] | null;
};

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const peso = (n: number) =>
  `PHP ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "—";

function checklistItems(checklist: unknown): { label: string; done: boolean }[] {
  if (!checklist) return [];
  if (Array.isArray(checklist)) {
    return checklist.map((entry) =>
      typeof entry === "string"
        ? { label: entry, done: true }
        : { label: String((entry as { label?: string; item?: string }).label ?? (entry as { item?: string }).item ?? ""), done: !!(entry as { done?: boolean }).done },
    );
  }
  if (typeof checklist === "object") {
    return Object.entries(checklist as Record<string, unknown>).map(([label, done]) => ({ label, done: !!done }));
  }
  return [];
}

export function jobReportHtml(job: JobReportInput) {
  const before = job.photos.find((p) => p.photo_type === "before" && p.url);
  const after = job.photos.find((p) => p.photo_type === "after" && p.url);
  const signature = job.photos.find((p) => p.photo_type === "signature" && p.url);
  const items = checklistItems(job.checklist).filter((i) => i.label);
  const total = (job.costs || []).reduce((sum, line) => sum + Number(line.line_cost || 0), 0);

  const photo = (label: string, p?: ReportPhoto) =>
    `<figure>${p?.url ? `<img src="${esc(p.url)}" alt="${label}">` : `<div class="none">No photo</div>`}<figcaption>${label}</figcaption></figure>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Job report - ${esc(job.customerName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px;font-size:14px;line-height:1.5}
  h1{margin:0;font-size:22px} h2{margin:22px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#555;border-bottom:1px solid #ccc;padding-bottom:4px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .brand{font-weight:800;font-size:18px} .muted{color:#555}
  table{width:100%;border-collapse:collapse} td,th{padding:6px 8px;border-bottom:1px solid #e3e3e3;text-align:left;vertical-align:top}
  th{font-size:12px;color:#555}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
  .grid b{display:block;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.06em}
  .photos{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  figure{margin:0} figure img{width:100%;max-height:300px;object-fit:cover;border:1px solid #ccc;border-radius:6px}
  figcaption{font-size:12px;color:#555;margin-top:4px;text-align:center}
  .none{height:140px;display:grid;place-items:center;border:1px dashed #bbb;border-radius:6px;color:#888}
  .sign{border:1px solid #ccc;border-radius:6px;padding:10px;background:#fff;display:inline-block}
  .sign img{max-height:120px;max-width:320px;filter:invert(1) hue-rotate(180deg)}
  .total{text-align:right;font-weight:800;font-size:15px;margin-top:8px}
  ul{margin:0;padding-left:18px}
  @media print{body{padding:0}}
</style></head><body>
<div class="top"><div><div class="brand">PKC BIZOFT</div><h1>${esc(job.jobType === "installation" ? "Installation report" : "Repair report")}</h1></div>
<div class="muted">Printed ${esc(when(new Date().toISOString()))}</div></div>

<h2>Customer</h2>
<div class="grid">
  <div><b>Name</b>${esc(job.customerName)}</div><div><b>Account</b>${esc(job.accountId || "—")}</div>
  <div><b>Address</b>${esc(job.address || "—")}</div><div><b>Technician</b>${esc(job.technician || "—")}</div>
</div>

<h2>Job</h2>
<div class="grid">
  <div><b>Status</b>${esc(job.status)}</div><div><b>Date</b>${esc(job.jobDate || "—")}</div>
  <div><b>Accepted</b>${esc(when(job.acceptedAt))}</div><div><b>Technician arrived</b>${esc(when(job.arrivedAt))}</div>
  <div><b>Finished</b>${esc(when(job.completedAt))}</div><div><b>Customer signed</b>${esc(when(job.signedAt))}</div>
</div>
<p><b>Problem / request:</b> ${esc(job.problem)}</p>
${job.resolution ? `<p><b>What was done:</b> ${esc(job.resolution)}</p>` : ""}

${items.length ? `<h2>Checklist</h2><ul>${items.map((i) => `<li>${i.done ? "&#10003;" : "&#10007;"} ${esc(i.label)}</li>`).join("")}</ul>` : ""}

<h2>Before and after</h2>
<div class="photos">${photo("Before", before)}${photo("After", after)}</div>

<h2>Customer signature</h2>
${signature?.url ? `<div class="sign"><img src="${esc(signature.url)}" alt="Customer signature"></div>` : `<p class="muted">Not signed.</p>`}

${
  job.costs
    ? `<h2>Materials and cost</h2>${
        job.costs.length
          ? `<table><tr><th>Material</th><th>Qty</th><th>Unit cost</th><th style="text-align:right">Cost</th></tr>${job.costs
              .map(
                (l) =>
                  `<tr><td>${esc(l.item_name)}</td><td>${esc(Number(l.qty))} ${esc(l.unit || "")}</td><td>${esc(peso(l.unit_cost))}</td><td style="text-align:right">${esc(peso(l.line_cost))}</td></tr>`,
              )
              .join("")}</table><div class="total">Total: ${esc(peso(total))}</div>`
          : `<p class="muted">No materials recorded for this job.</p>`
      }`
    : ""
}
<script>
  window.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print(); }, 400); });
</script>
</body></html>`;
}

/** Opens the report in a new tab and starts the print dialog (choose "Save as PDF"). */
export function openJobReport(job: JobReportInput) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(jobReportHtml(job));
  win.document.close();
  return true;
}
