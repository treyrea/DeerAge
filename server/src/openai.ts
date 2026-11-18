/** Kept so a leftover upstream failure still maps to the same status. The scan itself goes through the gateway. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
