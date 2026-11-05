export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Read at most the configured bytes, including chunked or misleading requests. */
export async function readBoundedBody(
  req: Request,
  maximum: number,
): Promise<ArrayBuffer> {
  const tooLarge = () =>
    new RequestBodyError(
      "This request is too large. Shorten the message or select fewer customers.",
      413,
    );
  if (Number(req.headers.get("content-length")) > maximum) throw tooLarge();
  if (!req.body) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  const reader = req.body.getReader();
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
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}
