import "server-only";

const MAX_BYTES = 6 * 1024 * 1024;

/** Pull plain text out of an uploaded CV (PDF, DOCX, TXT or Markdown). */
export async function extractCvText(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("CV files must be under 6 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return tidy(text);
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return tidy(result.value);
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return tidy(new TextDecoder().decode(bytes));
  }
  throw new Error("Upload your CV as a PDF, Word (.docx) or text file.");
}

function tidy(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
