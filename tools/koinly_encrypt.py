import base64
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

src = Path("artifacts/koinly-transactions.json")
out = Path("data/koinly-transactions.enc.json")
password = os.environ["KOINLY_DATA_KEY"]

if not src.exists():
    raise SystemExit("No Koinly transaction file was produced.")

salt = os.urandom(16)
nonce = os.urandom(12)
key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000, dklen=32)
ciphertext = AESGCM(key).encrypt(nonce, src.read_bytes(), None)

payload = {
    "version": 1,
    "kdf": "PBKDF2-SHA256",
    "iterations": 600000,
    "cipher": "AES-256-GCM",
    "salt": base64.b64encode(salt).decode(),
    "nonce": base64.b64encode(nonce).decode(),
    "ciphertext": base64.b64encode(ciphertext).decode(),
}

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
print("Encrypted Koinly dataset written to", out)
