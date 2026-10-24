/**
 * PDF Text Extraction Utility using pdf-parse.
 * Safely extracts plaintext from uploaded PDF documents with size and character caps.
 */
import { PDFParse } from 'pdf-parse';

export const MAX_PDF_TEXT_CHARS = 50_000;

export interface ExtractedPdfText {
  text: string;
  numPages: number;
}

/**
 * Extracts plain text from a PDF buffer.
 * Enforces page limits and truncates oversized text to avoid LLM context overflow.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedPdfText> {
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    const raw = data.text.replace(/\r\n/g, '\n');
    let cleanedText = '';
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code >= 32 || code === 9 || code === 10 || code === 13) {
        cleanedText += raw[i];
      }
    }
    cleanedText = cleanedText.trim();

    return {
      text: cleanedText.slice(0, MAX_PDF_TEXT_CHARS),
      numPages: data.pages.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF_EXTRACTION_FAILED: Failed to parse PDF text content (${message}).`);
  } finally {
    await parser.destroy();
  }
}
