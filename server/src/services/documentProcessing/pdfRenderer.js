import fs from 'node:fs/promises';
import { DocumentProcessingError } from './documentProcessingError.js';

const defaultScreenshotOptions = {
  scale: 1.8,
  imageDataUrl: false,
  imageBuffer: true,
};

function pageBufferFromScreenshotPage(page) {
  if (!page) {
    return null;
  }

  if (Buffer.isBuffer(page.data)) {
    return page.data;
  }

  if (page.data instanceof Uint8Array) {
    return Buffer.from(page.data);
  }

  if (Buffer.isBuffer(page.imageBuffer)) {
    return page.imageBuffer;
  }

  if (page.imageBuffer instanceof Uint8Array) {
    return Buffer.from(page.imageBuffer);
  }

  return null;
}

export async function renderPdfPagesToImageBuffers(filePath, options = {}) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const data = await fs.readFile(filePath);
    const parser = new PDFParse({ data });

    try {
      const result = await parser.getScreenshot({ ...defaultScreenshotOptions, ...options });
      const pages = (result.pages || [])
        .map((page, index) => ({
          pageNumber: Number(page.pageNumber || page.page || index + 1),
          buffer: pageBufferFromScreenshotPage(page),
        }))
        .filter((page) => page.buffer);

      if (pages.length === 0) {
        throw new DocumentProcessingError('PDF rendering returned no page images', 'PDF_RENDER_EMPTY');
      }

      pages.sort((left, right) => left.pageNumber - right.pageNumber);

      return {
        pageCount: Number(result.total || result.pages?.length || pages.length),
        pages,
      };
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    if (error instanceof DocumentProcessingError) {
      throw error;
    }

    throw new DocumentProcessingError(
      'Unable to render PDF pages for OCR',
      error?.code || 'PDF_RENDER_FAILED',
    );
  }
}
