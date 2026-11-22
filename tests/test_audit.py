import json

import boto3
from moto import mock_aws

from common import audit


def test_signed_record_verifies_and_tampering_fails(monkeypatch):
    with mock_aws():
        kms = boto3.client("kms")
        key = kms.create_key(KeySpec="ECC_NIST_P256", KeyUsage="SIGN_VERIFY")["KeyMetadata"]["KeyId"]
        boto3.client("s3").create_bucket(Bucket="audit")
        monkeypatch.setenv("AUDIT_BUCKET", "audit")
        monkeypatch.setenv("AUDIT_KEY_ID", key)
        audit._kms.cache_clear()
        audit._s3.cache_clear()

        k = audit.record("payment", "kv-s", "paid", {"L6": {"outcome": "paid"}}, ["R3"], txn_id="txn-1", message="pay")
        env = json.loads(boto3.client("s3").get_object(Bucket="audit", Key=k)["Body"].read())
        assert env["record"]["messageSha256"] and env["record"]["txnId"] == "txn-1"
        assert audit.verify(env, kms)
        env["record"]["outcome"] = "blocked"
        assert not audit.verify(env, kms)
        audit._kms.cache_clear()
        audit._s3.cache_clear()
