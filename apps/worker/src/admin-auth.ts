const textEncoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return new Uint8Array(digest);
}

function timingSafeEqualBytes(expected: Uint8Array, actual: Uint8Array): boolean {
  if (expected.byteLength !== actual.byteLength) return false;

  let difference = 0;
  for (let index = 0; index < expected.byteLength; index += 1) {
    difference |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
  }
  return difference === 0;
}

export async function authenticateAdminRequest(
  request: Request,
  expectedToken: string | undefined,
): Promise<boolean> {
  if (!expectedToken || textEncoder.encode(expectedToken).byteLength < 32) return false;

  const provided = request.headers.get('x-crapi-admin-token');
  if (!provided) return false;

  const [expectedDigest, providedDigest] = await Promise.all([
    sha256(expectedToken),
    sha256(provided),
  ]);
  return timingSafeEqualBytes(expectedDigest, providedDigest);
}
