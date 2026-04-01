export interface StoredPeerFingerprintRecord {
  fingerprint: string;
  verifiedAt: string;
}

const peerFingerprintStoragePrefix = "trusted-peer-fingerprint:";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function fingerprintHexValue(fingerprint: string | null): string | null {
  if (!fingerprint) {
    return null;
  }

  const [, value = ""] = fingerprint.split(" ");
  const normalizedValue = value.replace(/:/g, "").trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function fingerprintBytes(fingerprint: string | null): number[] {
  const hexValue = fingerprintHexValue(fingerprint);
  if (!hexValue || hexValue.length % 2 !== 0) {
    return [];
  }

  const bytes: number[] = [];
  for (let index = 0; index < hexValue.length; index += 2) {
    const byte = Number.parseInt(hexValue.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      return [];
    }
    bytes.push(byte);
  }
  return bytes;
}

export function extractDTLSFingerprint(sdp?: string | null): string | null {
  if (!sdp) {
    return null;
  }

  const lines = sdp.split(/\r?\n/);
  const preferredLine = lines.find((line) => /^a=fingerprint:sha-256\s+/i.test(line));
  const fallbackLine = preferredLine ?? lines.find((line) => /^a=fingerprint:/i.test(line));

  if (!fallbackLine) {
    return null;
  }

  const match = fallbackLine.match(/^a=fingerprint:([^\s]+)\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const algorithm = match[1].toLowerCase();
  const value = match[2].trim().toUpperCase();
  return `${algorithm} ${value}`;
}

export function buildFingerprintShortCode(fingerprint: string | null): string {
  const bytes = fingerprintBytes(fingerprint).slice(8, 14);
  if (bytes.length < 6) {
    return "";
  }

  const groups = [
    ((bytes[0] << 8) | bytes[1]).toString().padStart(5, "0"),
    ((bytes[2] << 8) | bytes[3]).toString().padStart(5, "0"),
    ((bytes[4] << 8) | bytes[5]).toString().padStart(5, "0"),
  ];
  return groups.join(" ");
}

function normalizeContinuityKey(continuityKey: string): string {
  return continuityKey.trim().toLowerCase();
}

function buildStorageKey(continuityKey: string): string {
  return `${peerFingerprintStoragePrefix}${normalizeContinuityKey(continuityKey)}`;
}

export function readStoredPeerFingerprint(
  continuityKey: string,
): StoredPeerFingerprintRecord | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(buildStorageKey(continuityKey));
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<StoredPeerFingerprintRecord>;
    if (
      typeof parsedValue.fingerprint !== "string" ||
      typeof parsedValue.verifiedAt !== "string"
    ) {
      return null;
    }

    return {
      fingerprint: parsedValue.fingerprint,
      verifiedAt: parsedValue.verifiedAt,
    };
  } catch {
    return null;
  }
}

export function writeStoredPeerFingerprint(
  continuityKey: string,
  fingerprint: string,
): StoredPeerFingerprintRecord {
  const nextRecord = {
    fingerprint,
    verifiedAt: new Date().toISOString(),
  };

  const storage = getSessionStorage();
  if (storage) {
    storage.setItem(buildStorageKey(continuityKey), JSON.stringify(nextRecord));
  }

  return nextRecord;
}

export function clearStoredPeerFingerprint(continuityKey: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(buildStorageKey(continuityKey));
  window.localStorage.removeItem(buildStorageKey(continuityKey));
}

export function purgeLegacyStoredPeerFingerprints(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(peerFingerprintStoragePrefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  }
}