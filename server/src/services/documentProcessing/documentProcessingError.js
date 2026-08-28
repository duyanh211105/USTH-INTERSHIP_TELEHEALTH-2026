export class DocumentProcessingError extends Error {
  constructor(message, code = 'DOCUMENT_PROCESSING_FAILED') {
    super(message);
    this.name = 'DocumentProcessingError';
    this.code = code;
  }
}
