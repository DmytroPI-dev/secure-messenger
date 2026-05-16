const encoder = new TextEncoder();
const decoder = new TextDecoder();

const mailboxIdContext = "rdv-mailbox-id:v1|";
const kdfSaltContext = "rdv-kdf-salt:v1|";
const accessContext = "rdv-access:v1";
const noteKeyContext = "rdv-note-key:v1";

const noteVersion = 1;
const pbkdf2Iterations = 600000;
const maxBulletinTextLength = 160;

export interface BulletinEnvelope {
  version: number;
  nonce: string;
  ciphertext: string;
}

export interface BulletinPayload {
  version: number;
  text: string;
  date?: string;
  time?: string;
}

interface PreparedMailbox {
  mailboxId: string;
  accessVerifier: string;
  noteKey: CryptoKey;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function normalizeLocator(rawValue: string): string {
  return rawValue
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/gu, "");
}

function normalizePassphrase(rawValue: string): string {
  return rawValue.trim().normalize("NFKC");
}

function parseMailboxCode(rawCode: string): { locator: string; passphrase: string } {
  const separatorIndex = rawCode.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex >= rawCode.length - 1) {
    throw new Error("invalid_code");
  }

  const locator = normalizeLocator(rawCode.slice(0, separatorIndex));
  const passphrase = normalizePassphrase(rawCode.slice(separatorIndex + 1));

  if (locator.length < 6 || locator.length > 12 || passphrase.length < 16) {
    throw new Error("invalid_code");
  }

  return { locator, passphrase };
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(input));
  return new Uint8Array(digest);
}

async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

async function deriveMailbox(rawCode: string): Promise<PreparedMailbox> {
  const { locator, passphrase } = parseMailboxCode(rawCode);

  const mailboxIdBytes = await sha256Bytes(encoder.encode(`${mailboxIdContext}${locator}`));
  const kdfSalt = await sha256Bytes(encoder.encode(`${kdfSaltContext}${locator}`));

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const seedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(kdfSalt),
      iterations: pbkdf2Iterations,
    },
    passwordKey,
    256,
  );

  const seedBytes = new Uint8Array(seedBits);
  const accessVerifierBytes = await hmacSha256(seedBytes, accessContext);
  const noteKeyBytes = await hmacSha256(seedBytes, noteKeyContext);
  const noteKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(noteKeyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return {
    mailboxId: hexEncode(mailboxIdBytes),
    accessVerifier: hexEncode(accessVerifierBytes),
    noteKey,
  };
}

function validatePayload(payload: BulletinPayload): void {
  if (payload.version !== noteVersion) {
    throw new Error("invalid_payload");
  }

  if (payload.text.trim() === "" || payload.text.length > maxBulletinTextLength || /\r|\n/u.test(payload.text)) {
    throw new Error("invalid_payload");
  }
}

export async function encryptBulletinPayload(rawCode: string, payload: BulletinPayload): Promise<{
  mailboxId: string;
  accessVerifier: string;
  ciphertextEnvelope: BulletinEnvelope;
}> {
  validatePayload(payload);

  const prepared = await deriveMailbox(rawCode);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    prepared.noteKey,
    toArrayBuffer(plaintext),
  );

  return {
    mailboxId: prepared.mailboxId,
    accessVerifier: prepared.accessVerifier,
    ciphertextEnvelope: {
      version: noteVersion,
      nonce: base64UrlEncode(nonce),
      ciphertext: base64UrlEncode(new Uint8Array(ciphertext)),
    },
  };
}

export async function prepareBulletinLookup(rawCode: string): Promise<{
  mailboxId: string;
  accessVerifier: string;
}> {
  const prepared = await deriveMailbox(rawCode);
  return {
    mailboxId: prepared.mailboxId,
    accessVerifier: prepared.accessVerifier,
  };
}

export async function decryptBulletinPayload(rawCode: string, envelope: BulletinEnvelope): Promise<BulletinPayload> {
  if (envelope.version !== noteVersion || !envelope.nonce || !envelope.ciphertext) {
    throw new Error("invalid_payload");
  }

  const prepared = await deriveMailbox(rawCode);
  const nonce = base64UrlDecode(envelope.nonce);
  const ciphertext = base64UrlDecode(envelope.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    prepared.noteKey,
    toArrayBuffer(ciphertext),
  );
  const parsed = JSON.parse(decoder.decode(new Uint8Array(plaintext))) as Partial<BulletinPayload>;

  if (
    parsed.version !== noteVersion ||
    typeof parsed.text !== "string"
  ) {
    throw new Error("invalid_payload");
  }

  const payload: BulletinPayload = {
    version: parsed.version,
    text: parsed.text,
    date: typeof parsed.date === "string" ? parsed.date : undefined,
    time: typeof parsed.time === "string" ? parsed.time : undefined,
  };

  validatePayload(payload);
  return payload;
}

export function getMaxBulletinTextLength(): number {
  return maxBulletinTextLength;
}