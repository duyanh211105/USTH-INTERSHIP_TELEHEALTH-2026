import fs from 'node:fs/promises';
import { DocumentProcessingError } from './documentProcessingError.js';
import { countMeaningfulCharacters, normalizeExtractedText } from './textNormalization.js';

export async function extractPdfText(filePath) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const data = await fs.readFile(filePath);
    const parser = new PDFParse({ data });

    try {
      const result = await parser.getText();
      const text = normalizeExtractedText(result.text || '');

      return {
        text,
        pageCount: Number(result.total || result.pages?.length || 0),
        meaningfulCharacterCount: countMeaningfulCharacters(text),
      };
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    throw new DocumentProcessingError(
      'Unable to extract text from PDF document',
      error?.code || 'PDF_TEXT_EXTRACTION_FAILED',
    );
  }
}
