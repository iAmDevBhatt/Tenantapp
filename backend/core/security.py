"""All crypto (password hashing + JWT) isolated here. Nothing else imports
jose/bcrypt directly.

Uses the `bcrypt` package directly rather than passlib's CryptContext:
passlib is unmaintained and its bcrypt backend-detection breaks against
current bcrypt releases (>=4.1 dropped the `__about__` attribute passlib
probes for), so pinning around it is more fragile than not depending on it."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import jwt, JWTError

from backend.core.config import settings

_BCRYPT_MAX_BYTES = 72  # bcrypt silently ignores/rejects input beyond this


def hash_password(password: str) -> str:
    pw_bytes = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    pw_bytes = plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    try:
        return bcrypt.checkpw(pw_bytes, hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str, role: str, extra_claims: Optional[dict] = None) -> str:
    """Returns a signed JWT. Always carries `sub` (user id) and `role`
    ("admin" | "tenant"); tenant tokens also carry a `tenantId` claim so
    tenant-scoped routes never have to trust a client-supplied tenant id."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    payload = {"sub": subject, "role": role, "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Returns the full claims dict (not just `sub`) -- deps.py needs `role`
    and, for tenants, `tenantId` to enforce access scoping."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
