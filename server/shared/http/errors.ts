export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class PayloadTooLargeError extends ApiError {
  constructor(message = 'Payload too large') {
    super(message, 413);
    this.name = 'PayloadTooLargeError';
  }
}

export class RequestTimeoutError extends ApiError {
  constructor(message = 'Request timeout') {
    super(message, 408);
    this.name = 'RequestTimeoutError';
  }
}

export class UnsupportedMediaTypeError extends ApiError {
  constructor(message = 'Unsupported media type') {
    super(message, 415);
    this.name = 'UnsupportedMediaTypeError';
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'TooManyRequestsError';
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service unavailable') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}
