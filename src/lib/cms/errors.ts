export type CmsErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "TOO_MANY_REQUESTS"
  | "EMAIL_NOT_CONFIGURED"
  | "EMAIL_SEND_FAILED"
  | "INTERNAL_SERVER_ERROR";

const statusByCode: Record<CmsErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  EMAIL_NOT_CONFIGURED: 409,
  EMAIL_SEND_FAILED: 502,
  INTERNAL_SERVER_ERROR: 500,
};

export class CmsError extends Error {
  readonly code: CmsErrorCode;
  readonly status: number;

  constructor(code: CmsErrorCode, message: string, status = statusByCode[code]) {
    super(message);
    this.name = "CmsError";
    this.code = code;
    this.status = status;
  }
}
