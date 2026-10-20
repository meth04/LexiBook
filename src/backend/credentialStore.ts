import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CredentialVault {
  getKey(): string | null;
  setKey(apiKey: string): void;
  deleteKey(): void;
  hasKey(): boolean;
}

export const SUPPORTED_GEMINI_MODELS = [
  'gemma-4-31b-it',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.5-flash',
  'gemma-4-26b-a4b-it',
  'gemini-2.5-flash-lite',
] as const;
export const DEFAULT_GEMINI_MODEL = 'gemma-4-31b-it';

/**
 * Redacts any occurrence of the configured API key, Google `AIza...` / `AQ....` keys,
 * or query/header key tokens from logs, error messages, and diagnostics.
 */
export function redactSecrets(input: string, currentKey?: string | null): string {
  if (!input) return '';
  let redacted = input;

  if (currentKey && currentKey.trim().length >= 4) {
    const escaped = currentKey.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    redacted = redacted.replace(new RegExp(escaped, 'g'), '[REDACTED_API_KEY]');
  }

  redacted = redacted.replace(/AIza[0-9A-Za-z_-]{8,}/g, '[REDACTED_API_KEY]');
  redacted = redacted.replace(/AQ\.[0-9A-Za-z_-]{10,}/g, '[REDACTED_API_KEY]');
  redacted = redacted.replace(
    /([?&]key=)[^&\s"']+/gi,
    '$1[REDACTED_API_KEY]'
  );
  redacted = redacted.replace(
    /(x-goog-api-key\s*:\s*)[^\s"',;]+/gi,
    '$1[REDACTED_API_KEY]'
  );

  return redacted;
}

/**
 * In-memory isolated credential vault for deterministic tests and ephemeral sessions.
 */
export function createInMemoryCredentialVault(initialKey: string | null = null): CredentialVault {
  let secret: string | null = initialKey ? initialKey.trim() : null;

  return {
    getKey() {
      return secret;
    },
    setKey(apiKey: string) {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new Error('Khóa API không được để trống.');
      }
      secret = trimmed;
    },
    deleteKey() {
      secret = null;
    },
    hasKey() {
      return Boolean(secret && secret.length > 0);
    },
  };
}

/**
 * Local machine-bound AES-256-GCM encrypted credential store kept outside SQLite (`lexibook.db`)
 * and outside backup archives (`books/`, `snapshot.json`).
 * Note: In compiled Tauri Rust runtime, `src-tauri/src/security/mod.rs` uses native Windows
 * Credential Manager (`CredWriteW` / `CredReadW` / `keyring`).
 */
export function createLocalEncryptedCredentialVault(vaultDir: string): CredentialVault {
  const vaultFile = path.join(vaultDir, '.wincred_gemini_vault.bin');

  function deriveMachineKey(): Buffer {
    const machineSeed = `LexiBookAI::WinCred::v1::${os.hostname()}::${os.userInfo().username}`;
    return crypto.createHash('sha256').update(machineSeed).digest();
  }

  return {
    getKey(): string | null {
      if (!fs.existsSync(vaultFile)) return null;
      try {
        const raw = fs.readFileSync(vaultFile);
        if (raw.byteLength < 28) return null;
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const ciphertext = raw.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', deriveMachineKey(), iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const str = decrypted.toString('utf8').trim();
        return str.length > 0 ? str : null;
      } catch {
        return null;
      }
    },
    setKey(apiKey: string): void {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new Error('Khóa API không được để trống.');
      }
      fs.mkdirSync(vaultDir, { recursive: true });
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', deriveMachineKey(), iv);
      const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      fs.writeFileSync(vaultFile, Buffer.concat([iv, tag, encrypted]), { mode: 0o600 });
    },
    deleteKey(): void {
      if (fs.existsSync(vaultFile)) {
        try {
          fs.unlinkSync(vaultFile);
        } catch {
          // ignore
        }
      }
    },
    hasKey(): boolean {
      return this.getKey() !== null;
    },
  };
}
