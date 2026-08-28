import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import sharp from 'sharp';
import { DocumentProcessingError } from '../services/documentProcessing/documentProcessingError.js';
import { extractText, MIN_MEANINGFUL_TEXT_LENGTH } from '../services/documentProcessing/documentTextExtractor.js';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telehealth-document-extraction-'));

function createFile(name, content = 'placeholder') {
  const filePath = path.join(testDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function fileMetadata(name, mimetype, content = 'placeholder') {
  const filePath = createFile(name, content);

  return {
    path: filePath,
    originalname: name,
    mimetype,
  };
}

function meaningfulText(length = MIN_MEANINGFUL_TEXT_LENGTH) {
  return 'A'.repeat(length);
}

after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('document text extraction service', () => {
  it('uses direct text extraction for text-based PDFs and does not call OCR', async () => {
    let renderCalled = false;
    let ocrCalled = false;

    const result = await extractText(fileMetadata('text-report.pdf', 'application/pdf'), {
      extractPdfText: async () => ({
        text: `  ${meaningfulText(75)}  `,
        pageCount: 2,
        meaningfulCharacterCount: 75,
      }),
      renderPdfPagesToImageBuffers: async () => {
        renderCalled = true;
        return { pageCount: 1, pages: [{ pageNumber: 1, buffer: Buffer.from('image') }] };
      },
      recognizeImageText: async () => {
        ocrCalled = true;
        return { text: 'Should not run' };
      },
    });

    assert.equal(result.extractionMethod, 'pdf_text');
    assert.equal(result.ocrUsed, false);
    assert.equal(result.pageCount, 2);
    assert.equal(renderCalled, false);
    assert.equal(ocrCalled, false);
  });

  it('falls back to OCR when PDF direct text has fewer than 50 meaningful characters', async () => {
    let renderCalled = false;

    const result = await extractText(fileMetadata('scanned-candidate.pdf', 'application/pdf'), {
      extractPdfText: async () => ({
        text: 'short text',
        pageCount: 1,
        meaningfulCharacterCount: 9,
      }),
      renderPdfPagesToImageBuffers: async () => {
        renderCalled = true;
        return { pageCount: 1, pages: [{ pageNumber: 1, buffer: Buffer.from('page-one') }] };
      },
      preprocessImage: async (buffer) => buffer,
      recognizeImageText: async () => ({ text: 'OCR text with enough meaningful medical content for extraction.' }),
    });

    assert.equal(renderCalled, true);
    assert.equal(result.extractionMethod, 'tesseract_ocr');
    assert.equal(result.ocrUsed, true);
    assert.match(result.text, /OCR text/);
  });

  it('processes scanned PDFs by rendering pages and running OCR', async () => {
    const result = await extractText(fileMetadata('scanned-report.pdf', 'application/pdf'), {
      extractPdfText: async () => ({
        text: '',
        pageCount: 1,
        meaningfulCharacterCount: 0,
      }),
      renderPdfPagesToImageBuffers: async () => ({
        pageCount: 1,
        pages: [{ pageNumber: 1, buffer: Buffer.from('scan-page') }],
      }),
      preprocessImage: async (buffer) => Buffer.from(`preprocessed-${buffer.toString()}`),
      recognizeImageText: async (buffer) => ({ text: `OCR result from ${buffer.toString()} with sufficient text.` }),
    });

    assert.equal(result.extractionMethod, 'tesseract_ocr');
    assert.equal(result.pageCount, 1);
    assert.match(result.text, /preprocessed-scan-page/);
  });

  it('preprocesses JPG files and runs Tesseract OCR', async () => {
    let preprocessed = false;

    const result = await extractText(fileMetadata('x-ray.jpg', 'image/jpeg'), {
      preprocessImage: async (input) => {
        preprocessed = true;
        assert.equal(typeof input, 'string');
        return Buffer.from('jpg-buffer');
      },
      recognizeImageText: async () => ({ text: 'JPG OCR result contains enough meaningful text for the record.' }),
    });

    assert.equal(preprocessed, true);
    assert.equal(result.extractionMethod, 'tesseract_ocr');
    assert.equal(result.pageCount, 1);
  });

  it('preprocesses PNG files and runs Tesseract OCR', async () => {
    const result = await extractText(fileMetadata('lab-result.png', 'image/png'), {
      preprocessImage: async () => Buffer.from('png-buffer'),
      recognizeImageText: async () => ({ text: 'PNG OCR result contains enough meaningful text for the record.' }),
    });

    assert.equal(result.extractionMethod, 'tesseract_ocr');
    assert.equal(result.ocrUsed, true);
  });

  it('rejects unsupported files safely', async () => {
    await assert.rejects(
      () => extractText(fileMetadata('notes.txt', 'text/plain')),
      (error) => error instanceof DocumentProcessingError && error.code === 'UNSUPPORTED_DOCUMENT_TYPE',
    );
  });

  it('returns a controlled error for corrupted PDFs', async () => {
    await assert.rejects(
      () => extractText(fileMetadata('corrupted.pdf', 'application/pdf'), {
        extractPdfText: async () => {
          throw new DocumentProcessingError('Unable to read PDF', 'PDF_TEXT_EXTRACTION_FAILED');
        },
      }),
      (error) => error instanceof DocumentProcessingError && error.code === 'PDF_TEXT_EXTRACTION_FAILED',
    );
  });

  it('returns a controlled error for corrupted images', async () => {
    await assert.rejects(
      () => extractText(fileMetadata('corrupted.png', 'image/png'), {
        preprocessImage: async () => {
          throw new DocumentProcessingError('Unable to preprocess image', 'IMAGE_PREPROCESSING_FAILED');
        },
      }),
      (error) => error instanceof DocumentProcessingError && error.code === 'IMAGE_PREPROCESSING_FAILED',
    );
  });

  it('fails safely when OCR returns empty or low-quality text', async () => {
    await assert.rejects(
      () => extractText(fileMetadata('blank.png', 'image/png'), {
        preprocessImage: async () => Buffer.from('blank'),
        recognizeImageText: async () => ({ text: ' \n\t ' }),
      }),
      (error) => error instanceof DocumentProcessingError && error.code === 'EMPTY_OCR_RESULT',
    );
  });

  it('combines multi-page scanned PDF OCR text in page order', async () => {
    const result = await extractText(fileMetadata('multi-page.pdf', 'application/pdf'), {
      extractPdfText: async () => ({
        text: '',
        pageCount: 2,
        meaningfulCharacterCount: 0,
      }),
      renderPdfPagesToImageBuffers: async () => ({
        pageCount: 2,
        pages: [
          { pageNumber: 2, buffer: Buffer.from('page-two') },
          { pageNumber: 1, buffer: Buffer.from('page-one') },
        ],
      }),
      preprocessImage: async (buffer) => buffer,
      recognizeImageText: async (buffer) => ({
        text: buffer.toString() === 'page-one'
          ? 'First page OCR text with enough medical document characters.'
          : 'Second page OCR text with enough medical document characters.',
      }),
    });

    assert.equal(result.pageCount, 2);
    assert.ok(result.text.indexOf('First page') < result.text.indexOf('Second page'));
  });

  it('applies the 50-character direct PDF extraction threshold exactly', async () => {
    const exactThreshold = await extractText(fileMetadata('exact-threshold.pdf', 'application/pdf'), {
      extractPdfText: async () => ({
        text: meaningfulText(50),
        pageCount: 1,
        meaningfulCharacterCount: 50,
      }),
      renderPdfPagesToImageBuffers: async () => {
        throw new Error('OCR fallback should not run at threshold');
      },
    });

    assert.equal(exactThreshold.extractionMethod, 'pdf_text');

    const belowThreshold = await extractText(fileMetadata('below-threshold.pdf', 'application/pdf'), {
      extractPdfText: async () => ({
        text: meaningfulText(49),
        pageCount: 1,
        meaningfulCharacterCount: 49,
      }),
      renderPdfPagesToImageBuffers: async () => ({
        pageCount: 1,
        pages: [{ pageNumber: 1, buffer: Buffer.from('page') }],
      }),
      preprocessImage: async (buffer) => buffer,
      recognizeImageText: async () => ({ text: 'Fallback OCR result has enough meaningful extracted medical text.' }),
    });

    assert.equal(belowThreshold.extractionMethod, 'tesseract_ocr');
  });

  it('runs an integration-style image preprocessing pipeline with sharp and mocked OCR', async () => {
    const imagePath = path.join(testDir, 'real-preprocess.jpg');
    await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toFile(imagePath);

    const result = await extractText({
      path: imagePath,
      originalname: 'real-preprocess.jpg',
      mimetype: 'image/jpeg',
    }, {
      recognizeImageText: async (buffer) => {
        assert.equal(Buffer.isBuffer(buffer), true);
        assert.ok(buffer.length > 0);
        return { text: 'Real sharp preprocessing completed before mocked OCR extraction text.' };
      },
    });

    assert.equal(result.extractionMethod, 'tesseract_ocr');
    assert.match(result.text, /Real sharp preprocessing/);
  });
});
