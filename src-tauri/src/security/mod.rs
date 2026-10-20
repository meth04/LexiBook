use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const KEYRING_SERVICE: &str = "com.lexibook.desktop.gemini";
const KEYRING_ACCOUNT: &str = "byok_api_key";

/// Stores and retrieves the user-supplied Gemini API key using the native Windows
/// Credential Manager (`keyring` crate on Windows targets `wincred`).
/// Never writes secrets to SQLite, logs, or exported archives.
pub fn set_gemini_api_key(api_key: &str) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key không được để trống.".to_string());
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Không thể khởi tạo Windows Credential Manager: {}", e))?;
    entry
        .set_password(trimmed)
        .map_err(|_| "Không thể lưu khóa vào Windows Credential Manager.".to_string())
}

pub fn get_gemini_api_key() -> Result<Option<String>, String> {
    if let Ok(mock_key) = env::var("LEXIBOOK_TEST_IN_MEMORY_KEY") {
        if !mock_key.is_empty() {
            return Ok(Some(mock_key));
        }
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Lỗi truy cập Credential Manager: {}", e))?;
    match entry.get_password() {
        Ok(secret) if !secret.trim().is_empty() => Ok(Some(secret)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Không thể đọc khóa từ Windows Credential Manager.".to_string()),
    }
}

pub fn delete_gemini_api_key() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Lỗi truy cập Credential Manager: {}", e))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Không thể xóa khóa khỏi Windows Credential Manager.".to_string()),
    }
}

/// Redacts any occurrence of a secret key or `AIza...` pattern from error strings or logs.
pub fn redact_secrets(input: &str, known_key: Option<&str>) -> String {
    let mut out = input.to_string();
    if let Some(k) = known_key {
        if !k.is_empty() {
            out = out.replace(k, "[REDACTED_API_KEY]");
        }
    }
    // Redact Google API key prefix patterns (AIza...)
    let mut result = String::with_capacity(out.len());
    let mut idx = 0;
    let bytes = out.as_bytes();
    while idx < bytes.len() {
        if out[idx..].starts_with("AIza") || out[idx..].starts_with("AQ.") {
            let prefix_len = if out[idx..].starts_with("AIza") { 4 } else { 3 };
            result.push_str("[REDACTED_API_KEY]");
            idx += prefix_len;
            while idx < bytes.len()
                && (bytes[idx].is_ascii_alphanumeric() || bytes[idx] == b'_' || bytes[idx] == b'-')
            {
                idx += 1;
            }
        } else {
            let ch = out[idx..].chars().next().unwrap();
            result.push(ch);
            idx += ch.len_utf8();
        }
    }
    result
}

/// Validates that a relative path stays strictly inside the base directory (prevents `../`, absolute paths, Windows drive prefixes, UNC paths, and symlinks).
pub fn validate_safe_relative_path(base_dir: &Path, rel_path: &str) -> Result<PathBuf, String> {
    if rel_path.is_empty()
        || rel_path.contains("..")
        || rel_path.starts_with('/')
        || rel_path.starts_with('\\')
        || rel_path.contains(':')
        || rel_path.contains('\0')
    {
        return Err(
            "Đường dẫn tệp không hợp lệ hoặc có nguy cơ vượt thư mục (path traversal).".to_string(),
        );
    }
    let joined = base_dir.join(rel_path);
    if let Ok(meta) = fs::symlink_metadata(&joined) {
        if meta.file_type().is_symlink() {
            return Err(
                "Không chấp nhận liên kết tượng trưng (symlink) trong kho lưu trữ.".to_string(),
            );
        }
    }
    Ok(joined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_redact_secrets_strips_api_keys() {
        let secret = "AIzaSySecretKeyForTestingRedaction12345";
        let raw = format!("Request failed with key={} in header", secret);
        let redacted = redact_secrets(&raw, Some(secret));
        assert!(!redacted.contains(secret));
        assert!(redacted.contains("[REDACTED_API_KEY]"));
    }

    #[test]
    fn test_validate_safe_relative_path_blocks_traversal() {
        let base = Path::new("C:\\AppData\\LexiBook");
        assert!(validate_safe_relative_path(base, "books/test_123.pdf").is_ok());
        assert!(validate_safe_relative_path(base, "../evil.dll").is_err());
        assert!(validate_safe_relative_path(base, "books/../../evil.exe").is_err());
        assert!(validate_safe_relative_path(base, "C:\\Windows\\System32\\cmd.exe").is_err());
        assert!(validate_safe_relative_path(base, "/etc/passwd").is_err());
    }
}
