export type CmsErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL_SERVER_ERROR";

const statusByCode: Record<CmsErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
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
