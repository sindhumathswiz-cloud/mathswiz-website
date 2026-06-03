import { NextResponse } from "next/server";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, { status });
}

export function errorResponse(
  code: string,
  message: string,
  status = 500,
  details?: Record<string, string[]>
) {
  return NextResponse.json<ApiError>(
    { success: false, error: { code, message, details } },
    { status }
  );
}

export function unauthorized(message = "Unauthorized") {
  return errorResponse("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Forbidden") {
  return errorResponse("FORBIDDEN", message, 403);
}

export function notFound(message = "Not found") {
  return errorResponse("NOT_FOUND", message, 404);
}

export function badRequest(message = "Bad request") {
  return errorResponse("BAD_REQUEST", message, 400);
}
