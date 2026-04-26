// types/api-error.d.ts - API 错误类型

export class ApiError extends Error {
  status: number;
  code?: string;
  url?: string;

  constructor(message: string, status: number, code?: string, url?: string);

  isNetworkError(): boolean;
  isTimeout(): boolean;
  isUnauthorized(): boolean;
  isForbidden(): boolean;
  isNotFound(): boolean;
  isServerError(): boolean;

  static fromResponse(
    response: Response,
    data?: { error?: { message?: string; code?: string } }
  ): ApiError;
}
