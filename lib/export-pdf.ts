import { jsPDF } from "jspdf";

export interface PdfColumnDef {
  header: string;
  key: string;
  width?: number;
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  agencyName: string;
  columns: PdfColumnDef[];
  rows: Record<string, unknown>[];
  summaryCards?: { label: string; value: string | number }[];
}

/**
 * Génère un document PDF institutionnel, élégant et paginé.
 */
export function generatePdfReport({
  title,
  subtitle,
  agencyName,
  columns,
  rows,
  summaryCards,
}: PdfReportOptions): Buffer {
  const isLandscape = columns.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. Bandeau supérieur corporate
  doc.setFillColor(30, 58, 138); // Bleu marine #1e3a8a
  doc.rect(0, 0, pageWidth, 16, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(agencyName.toUpperCase(), margin, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("PLATEFORME RECRUTEMENT • RAPPORT OFFICIEL", pageWidth - margin, 11, {
    align: "right",
  });

  // 2. Titre du rapport
  let currentY = 26;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(title, margin, currentY);

  currentY += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  const dateStr = `Édité le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString(
    "fr-FR"
  )}${subtitle ? ` • ${subtitle}` : ""}`;
  doc.text(dateStr, margin, currentY);

  currentY += 5;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  currentY += 5;

  // 3. Cartes de synthèse optionnelles
  if (summaryCards && summaryCards.length > 0) {
    const cardGap = 4;
    const cardWidth = (contentWidth - cardGap * (summaryCards.length - 1)) / summaryCards.length;
    const cardHeight = 14;

    summaryCards.forEach((card, idx) => {
      const cardX = margin + idx * (cardWidth + cardGap);
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.rect(cardX, currentY, cardWidth, cardHeight, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(card.label.toUpperCase(), cardX + 3, currentY + 4.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 138); // blue-900
      doc.text(String(card.value), cardX + 3, currentY + 10.5);
    });

    currentY += cardHeight + 6;
  }

  // 4. En-têtes du tableau
  const colCount = columns.length;
  const colWidth = contentWidth / colCount;

  const renderHeader = (y: number) => {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7.5, "F");
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(margin, y, contentWidth, 7.5, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59); // slate-800

    columns.forEach((col, idx) => {
      const x = margin + idx * colWidth + 2;
      doc.text(col.header, x, y + 5.2, { maxWidth: colWidth - 4 });
    });
  };

  renderHeader(currentY);
  currentY += 7.5;

  // 5. Lignes de données
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  const rowHeight = 6.5;
  rows.forEach((r, rowIdx) => {
    // Vérifier saut de page
    if (currentY + rowHeight > pageHeight - 16) {
      doc.addPage();
      currentY = 20;
      renderHeader(currentY);
      currentY += 7.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(margin, currentY, contentWidth, rowHeight, "F");
    }

    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, currentY, contentWidth, rowHeight, "S");

    columns.forEach((col, idx) => {
      const x = margin + idx * colWidth + 2;
      const rawVal = String(r[col.key] ?? "");
      const safeVal = rawVal.length > 36 ? rawVal.substring(0, 34) + "..." : rawVal;
      doc.text(safeVal, x, currentY + 4.5, { maxWidth: colWidth - 4 });
    });

    currentY += rowHeight;
  });

  // 6. Pagination globale
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Document confidentiel — ${agencyName} • Page ${i} sur ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
