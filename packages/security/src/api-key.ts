export type ApiKeyEnvironment = 'TEST' | 'LIVE';

export interface ParsedApiKey {
  environment: ApiKeyEnvironment;
  keyPrefix: string;
}

export interface GeneratedApiKey extends ParsedApiKey {
  rawKey: string;
  last4: string;
  digest: string;
}

const API_KEY_PATTERN = /^(prk_(test|live)_([0-9a-f]{16}))_([A-Za-z0-9_-]{43})$/;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const textEncoder = new TextEncoder();

function randomBytes(length: number): Uint8Array {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function base64UrlChar(index: number): string {
  return BASE64URL_ALPHABET.charAt(index);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];

    output += base64UrlChar((first >> 2) & 63);
    output += base64UrlChar(((first & 3) << 4) | ((second ?? 0) >> 4));

    if (second !== undefined) {
      output += base64UrlChar(((second & 15) << 2) | ((third ?? 0) >> 6));
    }

    if (third !== undefined) {
      output += base64UrlChar(third & 63);
    }
  }

  return output;
}

function assertPepper(pepper: string): void {
  if (textEncoder.encode(pepper).byteLength < 32) {
    throw new Error('API_KEY_PEPPER must contain at least 32 UTF-8 bytes.');
  }
}

export function parseApiKey(rawKey: string): ParsedApiKey | null {
  const match = API_KEY_PATTERN.exec(rawKey);
  if (!match) return null;

  const environment = match[2] === 'live' ? 'LIVE' : 'TEST';
  const keyPrefix = match[1];
  if (keyPrefix === undefined) return null;

  return { environment, keyPrefix };
}

export async function digestApiKey(rawKey: string, pepper: string): Promise<string> {
  assertPepper(pepper);

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(rawKey));
  return bytesToHex(new Uint8Array(signature));
}

export async function generateApiKey(
  environment: ApiKeyEnvironment,
  pepper: string,
): Promise<GeneratedApiKey> {
  const environmentToken = environment === 'LIVE' ? 'live' : 'test';
  const identifier = bytesToHex(randomBytes(8));
  const secret = bytesToBase64Url(randomBytes(32));
  const keyPrefix = `prk_${environmentToken}_${identifier}`;
  const rawKey = `${keyPrefix}_${secret}`;

  return {
    environment,
    keyPrefix,
    rawKey,
    last4: rawKey.slice(-4),
    digest: await digestApiKey(rawKey, pepper),
  };
}

export function timingSafeEqualHex(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }

  return difference === 0;
}

export async function verifyApiKeyDigest(
  rawKey: string,
  expectedDigest: string,
  pepper: string,
): Promise<boolean> {
  if (parseApiKey(rawKey) === null) return false;
  const actualDigest = await digestApiKey(rawKey, pepper);
  return timingSafeEqualHex(expectedDigest, actualDigest);
}
