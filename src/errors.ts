export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = "ApiError";
  }
}

export function fail(code: string, message: string): { ok: false; errorCode: string; error: string } {
  return { ok: false, errorCode: code, error: message };
}
