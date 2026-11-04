/**
 * PDF documents (D8): the payment receipt and the student's result slip,
 * printed in the user's language (Somali or English, baseline 6.8).
 *
 * buildPdf() lays out a title, an optional red DEMO banner, a list of
 * label/value rows and an optional table, and returns the file as a Buffer.
 * It uses PDFKit's built-in Helvetica font, which covers the Latin letters
 * used in Somali. No network access, no files written.
 */
import PDFDocument from "pdfkit";

export interface PdfContent {
  title: string;
  subtitle?: string;
  /** Shown as a red banner and a diagonal watermark (simulated payments). */
  demoBanner?: string;
  rows: [string, string][];
  table?: { header: string[]; rows: string[][]; widths: number[] };
  footer?: string;
}

/** Renders the content as an A4 PDF. @returns the file bytes. */
export function buildPdf(c: PdfContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: c.title, Producer: "Online Exam Platform" } });
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (c.demoBanner) {
      doc.save().rotate(-30, { origin: [300, 420] }).fontSize(40).fillColor("#f2c4c4").text("DEMO", 140, 380, { width: 320, align: "center" }).restore();
      doc.rect(50, 40, 495, 26).fill("#b42318");
      doc.fillColor("#ffffff").fontSize(11).text(c.demoBanner, 58, 48, { width: 480, align: "center" });
      doc.moveDown(2);
    }
    doc.fillColor("#111111").fontSize(20).text(c.title, 50, c.demoBanner ? 90 : 50);
    if (c.subtitle) doc.fontSize(11).fillColor("#555555").text(c.subtitle);
    doc.moveDown();

    for (const [label, value] of c.rows) {
      const y = doc.y;
      doc.fontSize(11).fillColor("#555555").text(label, 50, y, { width: 170 });
      doc.fillColor("#111111").text(value, 230, y, { width: 315 });
      doc.moveDown(0.4);
    }

    if (c.table) {
      doc.moveDown();
      const x0 = 50;
      const drawRow = (cells: string[], bold: boolean) => {
        const y = doc.y;
        let x = x0;
        let h = 0;
        cells.forEach((cell, i) => {
          doc.fontSize(9).fillColor(bold ? "#111111" : "#333333").font(bold ? "Helvetica-Bold" : "Helvetica");
          const height = doc.heightOfString(cell, { width: c.table!.widths[i] - 6 });
          doc.text(cell, x + 3, y, { width: c.table!.widths[i] - 6 });
          h = Math.max(h, height);
          x += c.table!.widths[i];
        });
        doc.font("Helvetica");
        doc.y = y + h + 4;
        doc.moveTo(x0, doc.y - 2).lineTo(x0 + c.table!.widths.reduce((a, b) => a + b, 0), doc.y - 2).strokeColor("#dddddd").stroke();
        if (doc.y > 760) doc.addPage();
      };
      drawRow(c.table.header, true);
      for (const r of c.table.rows) drawRow(r, false);
    }

    if (c.footer) {
      doc.moveDown(2);
      doc.fontSize(8).fillColor("#777777").text(c.footer, 50, doc.y, { width: 495 });
    }
    doc.end();
  });
}
