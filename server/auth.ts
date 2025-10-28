import { randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { scrypt as _scrypt } from "crypto";

const scrypt = promisify(_scrypt);

// Format: $scrypt$<saltBase64>$<hashBase64>
const PREFIX = "$scrypt$";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${PREFIX}${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith(PREFIX)) {
      const parts = stored.split("$");
      // ["", "scrypt", "<salt>", "<hash>"] or ["$scrypt", "<salt>", "<hash>"] depending on split
      const saltB64 = parts[parts[0] === "" ? 2 : 1];
      const hashB64 = parts[parts[0] === "" ? 3 : 2];
      const salt = Buffer.from(saltB64, "base64");
      const expected = Buffer.from(hashB64, "base64");
      const key = (await scrypt(password, salt, expected.length)) as Buffer;
      if (key.length !== expected.length) return false;
      return timingSafeEqual(key, expected);
    }
    // Transitional support: plaintext stored password
    return stored === password;
  } catch {
    return false;
  }
}