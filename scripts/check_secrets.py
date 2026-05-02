#!/usr/bin/env python3
"""
Pre-commit secret scanner for the Kavya Transports repo.
Run:    python scripts/check_secrets.py
Add to CI: runs on every push (exit 1 if any leak detected).

Scans tracked source files for committed credentials. Skips .env (which is
itself gitignored) and any directory listed in IGNORE_DIRS.
"""
import re
import sys
from pathlib import Path

# (regex, label) tuples — patterns that should never appear in committed files.
SECRET_PATTERNS = [
    (r"MSG91_AUTH_KEY\s*=\s*['\"]?[A-Za-z0-9]{20,}", "MSG91 API key"),
    (r"MSG91_WIDGET_ID\s*=\s*['\"]?[A-Za-z0-9]{20,}", "MSG91 Widget ID"),
    (r"BREVO_API_KEY\s*=\s*['\"]?xkeysib-[A-Za-z0-9-]{20,}", "Brevo API key"),
    (r"SECRET_KEY\s*=\s*['\"]?[A-Za-z0-9]{32,}", "JWT Secret Key"),
    (r"AWS_SECRET_ACCESS_KEY\s*=\s*['\"]?[A-Za-z0-9+/]{30,}", "AWS Secret Key"),
    (r"AWS_ACCESS_KEY_ID\s*=\s*['\"]?AKIA[A-Z0-9]{16}", "AWS Access Key ID"),
    (r"-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----", "Private key block"),
]

SCAN_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".yaml", ".yml", ".toml", ".sh", ".dart", ".kt", ".java"}
IGNORE_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".dart_tool", ".gradle"}
IGNORE_FILES = {".env", ".env.local", ".env.production", ".env.development", "check_secrets.py", "security_check.py"}


def scan() -> int:
    root = Path(__file__).resolve().parent.parent
    violations: list[str] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.name in IGNORE_FILES:
            continue
        if path.suffix not in SCAN_EXTENSIONS:
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for pattern, label in SECRET_PATTERNS:
            if re.search(pattern, text):
                violations.append(f"  [LEAK] {label} found in: {path.relative_to(root)}")

    if violations:
        print("SECRET SCAN FAILED \u2014 Do not commit:\n")
        for v in violations:
            print(v)
        print("\nRotate the leaked credential immediately, then remove it from the file.")
        return 1

    print("OK \u2014 No hardcoded secrets found in tracked source files.")
    return 0


if __name__ == "__main__":
    sys.exit(scan())
