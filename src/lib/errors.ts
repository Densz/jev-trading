export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === "ZodError")
    return new AppError(
      "MALFORMED_RESPONSE",
      "A provider returned data that did not match the expected format.",
    );
  return new AppError(
    "INTERNAL_ERROR",
    "The request could not be completed. Check the server logs.",
    500,
  );
}
