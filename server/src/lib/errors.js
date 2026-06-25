export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const httpError = (status, code, message, details) => new HttpError(status, code, message, details);
