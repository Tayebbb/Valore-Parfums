export const MAX_CUSTOMER_REQUEST_BYTES = 512 * 1024;
export const CUSTOMER_MESSAGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CustomerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Bound the actual stream, even when Content-Length is absent or dishonest. */
export async function readCustomerJson(
  req: Request,
  maximum = MAX_CUSTOMER_REQUEST_BYTES,
): Promise<unknown> {
  const tooLarge = () =>
    new CustomerRequestError(
      "This request is too large. Shorten the message or select fewer customers.",
      413,
    );
  if (Number(req.headers.get("content-length")) > maximum) throw tooLarge();
  if (!req.body)
    throw new CustomerRequestError("Enter a valid JSON request.", 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CustomerRequestError("Enter a valid JSON request.", 400);
  }
}
