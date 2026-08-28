import { validateMedicalDocument } from '../storageService.js';
import { DocumentProcessingError } from './documentProcessingError.js';
import { extractPdfText } from './pdfTextExtractor.js';
import { renderPdfPagesToImageBuffers } from './pdfRenderer.js';
import { preprocessImage } from './imagePreprocessor.js';
import { recognizeImageText } from './ocrService.js';
import {
  MIN_MEANINGFUL_TEXT_LENGTH,
  countMeaningfulCharacters,
  hasMeaningfulText,
  normalizeExtractedText,
} from './textNormalization.js';

const pdfMimeType = 'application/pdf';
const imageMimeTypes = new Set(['image/jpeg', 'image/png']);

function assertSupportedFile(file) {
  if (!file?.path || !file?.mimetype || !file?.originalname) {
    throw new DocumentProcessingError(
      'Document file path, MIME type, and original filename are required',
      'INVALID_DOCUMENT_FILE',
    );
  }

  try {
    validateMedicalDocument(file);
  } catch (error) {
    throw new DocumentProcessingError(error.message || 'Unsupported medical document type', 'UNSUPPORTED_DOCUMENT_TYPE');
  }
}

function assertOcrTextIsUsable(text, threshold) {
  if (!hasMeaningfulText(text, threshold)) {
    throw new DocumentProcessingError(
      'OCR did not return enough meaningful text',
      'EMPTY_OCR_RESULT',
    );
  }
}

async function extractImageTextWithOcr(input, {
  preprocessImage: preprocess = preprocessImage,
  recognizeImageText: recognize = recognizeImageText,
  minMeaningfulTextLength,
} = {}) {
  const preprocessedBuffer = await preprocess(input);
  const ocrResult = await recognize(preprocessedBuffer);
  const text = normalizeExtractedText(ocrResult.text);

  assertOcrTextIsUsable(text, minMeaningfulTextLength);

  return {
    text,
    confidence: ocrResult.confidence ?? null,
    meaningfulCharacterCount: countMeaningfulCharacters(text),
  };
}

async function extractPdfViaOcr(file, {
  renderPdfPagesToImageBuffers: renderPdf = renderPdfPagesToImageBuffers,
  preprocessImage: preprocess = preprocessImage,
  recognizeImageText: recognize = recognizeImageText,
  minMeaningfulTextLength,
} = {}) {
  const rendered = await renderPdf(file.path);
  const pageTexts = [];

  for (const page of rendered.pages) {
    const preprocessedBuffer = await preprocess(page.buffer);
    const result = await recognize(preprocessedBuffer);

    pageTexts.push({
      pageNumber: page.pageNumber,
      text: normalizeExtractedText(result.text),
    });
  }

  const text = normalizeExtractedText(
    pageTexts
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((page) => page.text)
      .join('\n\n'),
  );

  assertOcrTextIsUsable(text, minMeaningfulTextLength);

  return {
    text,
    extractionMethod: 'tesseract_ocr',
    pageCount: Number(rendered.pageCount || rendered.pages.length),
    ocrUsed: true,
  };
}

export async function extractText(file, options = {}) {
  assertSupportedFile(file);

  const minMeaningfulTextLength = Number.isFinite(Number(options.minMeaningfulTextLength))
    ? Number(options.minMeaningfulTextLength)
    : MIN_MEANINGFUL_TEXT_LENGTH;

  if (file.mimetype === pdfMimeType) {
    const extractPdf = options.extractPdfText || extractPdfText;
    const pdfTextResult = await extractPdf(file.path);
    const text = normalizeExtractedText(pdfTextResult.text);
    const meaningfulCharacterCount = Number.isFinite(Number(pdfTextResult.meaningfulCharacterCount))
      ? Number(pdfTextResult.meaningfulCharacterCount)
      : countMeaningfulCharacters(text);

    if (meaningfulCharacterCount >= minMeaningfulTextLength) {
      return {
        text,
        extractionMethod: 'pdf_text',
        pageCount: Number(pdfTextResult.pageCount || 0),
        ocrUsed: false,
      };
    }

    return extractPdfViaOcr(file, {
      ...options,
      minMeaningfulTextLength,
    });
  }

  if (imageMimeTypes.has(file.mimetype)) {
    const result = await extractImageTextWithOcr(file.path, {
      ...options,
      minMeaningfulTextLength,
    });

    return {
      text: result.text,
      extractionMethod: 'tesseract_ocr',
      pageCount: 1,
      ocrUsed: true,
    };
  }

  throw new DocumentProcessingError('Unsupported medical document type', 'UNSUPPORTED_DOCUMENT_TYPE');
}

export { MIN_MEANINGFUL_TEXT_LENGTH } from './textNormalization.js';
