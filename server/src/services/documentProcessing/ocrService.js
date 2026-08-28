import { createRequire } from 'node:module';
import { DocumentProcessingError } from './documentProcessingError.js';
import { countMeaningfulCharacters, normalizeExtractedText } from './textNormalization.js';

const require = createRequire(import.meta.url);

function getLocalLanguageOptions(language) {
  if (language !== 'eng') {
    return {};
  }

  try {
    return require('@tesseract.js-data/eng');
  } catch {
    return {};
  }
}

export async function recognizeImageText(imageBuffer, options = {}) {
  try {
    const tesseractModule = await import('tesseract.js');
    const tesseract = tesseractModule.default || tesseractModule;
    const language = options.language || process.env.OCR_LANGUAGE || 'eng';
    const localLanguageOptions = getLocalLanguageOptions(language);
    const tesseractOptions = {
      ...localLanguageOptions,
      ...(process.env.OCR_LANG_PATH ? { langPath: process.env.OCR_LANG_PATH } : {}),
      ...(options.langPath ? { langPath: options.langPath } : {}),
    };

    if (options.gzip !== undefined) {
      tesseractOptions.gzip = options.gzip;
    }

    if (typeof options.logger === 'function') {
      tesseractOptions.logger = options.logger;
    }

    const result = await tesseract.recognize(imageBuffer, language, tesseractOptions);
    const text = normalizeExtractedText(result?.data?.text || '');

    return {
      text,
      confidence: result?.data?.confidence ?? null,
      meaningfulCharacterCount: countMeaningfulCharacters(text),
    };
  } catch (error) {
    throw new DocumentProcessingError(
      'OCR processing failed',
      error?.code || 'OCR_FAILED',
    );
  }
}
