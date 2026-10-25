import ExcelJS from "exceljs";

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelReportOptions {
  title: string;
  subtitle?: string;
  agencyName: string;
  sheetName?: string;
  columns: ExcelColumnDef[];
  rows: Record<string, unknown>[];
  summaryCards?: { label: string; value: string | number }[];
}

/**
 * Génère un classeur Excel (.xlsx) stylisé et professionnel.
 */
export async function generateExcelReport({
  title,
  subtitle,
  agencyName,
  sheetName = "Rapport",
  columns,
  rows,
  summaryCards,
}: ExcelReportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = agencyName;
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  let currentRowIndex = 1;

  // 1. En-tête Institutionnel
  const lastColLetter = String.fromCharCode(64 + Math.max(columns.length, 4));
  worksheet.mergeCells(`A${currentRowIndex}`, `${lastColLetter}${currentRowIndex}`);
  const titleCell = worksheet.getCell(`A${currentRowIndex}`);
  titleCell.value = `${agencyName.toUpperCase()} — ${title}`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1E293B" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(currentRowIndex).height = 28;
  currentRowIndex++;

  worksheet.mergeCells(`A${currentRowIndex}`, `${lastColLetter}${currentRowIndex}`);
  const subCell = worksheet.getCell(`A${currentRowIndex}`);
  const dateStr = `Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}${
    subtitle ? ` • ${subtitle}` : ""
  }`;
  subCell.value = dateStr;
  subCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF64748B" } };
  subCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(currentRowIndex).height = 18;
  currentRowIndex++;

  // 2. Cartes de synthèse optionnelles
  if (summaryCards && summaryCards.length > 0) {
    currentRowIndex++; // espace
    const summaryRow = worksheet.getRow(currentRowIndex);
    summaryRow.height = 30;

    summaryCards.forEach((card, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = worksheet.getCell(`${colLetter}${currentRowIndex}`);
      cell.value = `${card.label.toUpperCase()}\n${card.value}`;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF1E3A8A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFF6FF" }, // blue-50
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFDBFE" } },
        bottom: { style: "thin", color: { argb: "FFBFDBFE" } },
        left: { style: "thin", color: { argb: "FFBFDBFE" } },
        right: { style: "thin", color: { argb: "FFBFDBFE" } },
      };
    });
    currentRowIndex += 2;
  } else {
    currentRowIndex++; // espace
  }

  // 3. Colonnes du tableau de données
  const headerRow = worksheet.getRow(currentRowIndex);
  headerRow.values = columns.map((c) => c.header);
  headerRow.height = 24;

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Bleu marine élégant
    };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF94A3B8" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF94A3B8" } },
      right: { style: "thin", color: { argb: "FF94A3B8" } },
    };
  });
  currentRowIndex++;

  // 4. Lignes de données
  rows.forEach((rowData, index) => {
    const rowValues = columns.map((col) => rowData[col.key] ?? "");
    const row = worksheet.addRow(rowValues);
    row.height = 20;

    const isEven = index % 2 === 0;
    row.eachCell((cell) => {
      cell.font = { name: "Arial", size: 9, color: { argb: "FF0F172A" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // 5. Largeurs automatiques des colonnes
  columns.forEach((col, idx) => {
    const maxValLength = rows.reduce((max, r) => {
      const val = String(r[col.key] ?? "");
      return Math.max(max, val.length);
    }, col.header.length);
    worksheet.getColumn(idx + 1).width = Math.min(Math.max(col.width || maxValLength + 4, 12), 48);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
