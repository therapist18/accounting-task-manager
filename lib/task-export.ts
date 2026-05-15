import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export type TaskExportRow = Record<string, unknown>;

const DEFAULT_TITLE = "Task Manager Export";
const MAX_ROWS = 2000;
const MAX_COLUMNS = 40;

const safeText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const safeFilename = (value: string): string =>
  value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "task-export";

export const timestampForFilename = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export const buildExportFilename = (title: string | undefined, extension: "pdf" | "docx") =>
  `${safeFilename(title || DEFAULT_TITLE)}-${timestampForFilename()}.${extension}`;

export const normalizeExportRows = (rows: unknown): { headers: string[]; body: string[][] } => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No task rows were provided for export.");
  }

  const limitedRows = rows.slice(0, MAX_ROWS) as TaskExportRow[];
  const headerSet = new Set<string>();

  limitedRows.forEach(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    Object.keys(row).forEach(key => headerSet.add(key));
  });

  const headers = Array.from(headerSet).slice(0, MAX_COLUMNS);
  if (headers.length === 0) {
    throw new Error("Task rows do not contain exportable fields.");
  }

  const body = limitedRows.map(row => headers.map(header => safeText(row?.[header])));
  return { headers, body };
};

export const createTaskPdf = (rows: unknown, title = DEFAULT_TITLE): ArrayBuffer => {
  const { headers, body } = normalizeExportRows(rows);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generated ${new Date().toLocaleString()} | ${body.length} row(s)`, 14, 20);
  doc.setTextColor(0);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 25,
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [30, 63, 45],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [246, 248, 246],
    },
    margin: { left: 8, right: 8, top: 16, bottom: 10 },
  });

  return doc.output("arraybuffer");
};

const wordCell = (text: string, header = false) =>
  new TableCell({
    shading: header ? { fill: "1E3F2D" } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "D9E2DD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "D9E2DD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "D9E2DD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "D9E2DD" },
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: header,
            color: header ? "FFFFFF" : "243126",
            size: header ? 16 : 15,
          }),
        ],
      }),
    ],
  });

export const createTaskWord = async (rows: unknown, title = DEFAULT_TITLE): Promise<Buffer> => {
  const { headers, body } = normalizeExportRows(rows);

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(header => wordCell(header, true)) }),
      ...body.map(row => new TableRow({ children: row.map(value => wordCell(value)) })),
    ],
  });

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: "landscape" },
            margin: { top: 720, right: 540, bottom: 720, left: 540 },
          },
        },
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleString()} | ${body.length} row(s)`,
                color: "68756C",
                size: 18,
              }),
            ],
            spacing: { after: 240 },
          }),
          table,
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
};
