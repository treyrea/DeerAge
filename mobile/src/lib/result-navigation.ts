/**
 * The processing screen opens the result on its own once a scan finishes.
 * A stop (need a better look, no deer, no body, a mount) sets an error and
 * must stay on that message. A result left over from an earlier scan does not count.
 */
export function shouldAdvanceToResult(input: {
  isProcessing: boolean;
  hasResult: boolean;
  hasError: boolean;
}): boolean {
  return !input.isProcessing && input.hasResult && !input.hasError;
}
