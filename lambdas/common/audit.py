"""L9: signed audit. One record per decision, signed with a KMS asymmetric key
(ECDSA P-256) and written to S3 under Object Lock (compliance mode).

The signature covers the SHA-256 of the record's canonical JSON, so anyone
with kms:Verify (or the exported public key) can check a record offline.
Without AUDIT_BUCKET set (unit tests), records are built but not written.
"""

import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from functools import cache

import boto3

SIGNING_ALGORITHM = "ECDSA_SHA_256"


def canonical(record: dict) -> bytes:
    return json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()


def message_hash(text: str | None) -> str | None:
    return hashlib.sha256(text.encode()).hexdigest() if text else None


@cache
def _kms():
    return boto3.client("kms")


@cache
def _s3():
    return boto3.client("s3")


def record(
    kind: str,
    session_id: str | None,
    outcome: str,
    layers: dict,
    rule_ids=(),
    *,
    tool: str | None = None,
    tool_input: dict | None = None,
    message: str | None = None,
    txn_id: str | None = None,
    approval_id: str | None = None,
    model_id: str | None = None,
    extra: dict | None = None,
) -> str | None:
    """Sign and store one decision. Returns the S3 key (None when not configured)."""
    now = datetime.now(timezone.utc)
    rec = {
        "auditId": uuid.uuid4().hex,
        "kind": kind,
        "timestamp": now.isoformat(),
        "sessionId": session_id,
        "messageSha256": message_hash(message),
        "tool": tool,
        "input": tool_input,
        "layers": layers,
        "outcome": outcome,
        "ruleIds": sorted(set(rule_ids)),
        "txnId": txn_id,
        "approvalId": approval_id,
        "modelId": model_id,
        **(extra or {}),
    }
    bucket, key_id = os.environ.get("AUDIT_BUCKET"), os.environ.get("AUDIT_KEY_ID")
    if not bucket or not key_id:
        return None
    digest = hashlib.sha256(canonical(rec)).digest()
    sig = _kms().sign(KeyId=key_id, Message=digest, MessageType="DIGEST", SigningAlgorithm=SIGNING_ALGORITHM)
    envelope = {
        "record": rec,
        "signature": base64.b64encode(sig["Signature"]).decode(),
        "keyId": sig["KeyId"],
        "algorithm": SIGNING_ALGORITHM,
        "digest": "sha256(canonical(record))",
    }
    key = f"audit/{now:%Y-%m-%d}/{session_id or 'no-session'}/{now:%H%M%S%f}-{kind}-{rec['auditId'][:8]}.json"
    _s3().put_object(Bucket=bucket, Key=key, Body=canonical(envelope), ContentType="application/json")
    return key


def verify(envelope: dict, kms=None) -> bool:
    kms = kms or _kms()
    digest = hashlib.sha256(canonical(envelope["record"])).digest()
    try:
        return kms.verify(
            KeyId=envelope["keyId"],
            Message=digest,
            MessageType="DIGEST",
            Signature=base64.b64decode(envelope["signature"]),
            SigningAlgorithm=envelope["algorithm"],
        )["SignatureValid"]
    except kms.exceptions.KMSInvalidSignatureException:
        return False
