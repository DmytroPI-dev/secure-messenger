export function normalizeAccessPhrase(phrase: string): string {
  return phrase
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizeExactAccessPhrase(phrase: string): string {
  return phrase
    .trim()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export async function hashPhrase(phrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const normalizedPhrase = normalizeExactAccessPhrase(phrase);
  const data = encoder.encode(normalizedPhrase);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 10);
}
