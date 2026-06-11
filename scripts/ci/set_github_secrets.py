#!/usr/bin/env python3
"""
Configura os 4 secrets de E2E HIGH staging no repositório GitHub via API.

Uso:
  python3 scripts/ci/set_github_secrets.py \
    --token GH_PAT \
    --repo OWNER/REPO \
    --staging-url https://... \
    --staging-token tok-... \
    --tenant-id tenant-xxx \
    --workspace-id workspace-xxx

Requer: PyNaCl (pip install PyNaCl)
"""

import argparse
import base64
import json
import sys
import urllib.request
import urllib.error
from nacl import encoding, public


def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    pk = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder)
    sealed_box = public.SealedBox(pk)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def github_request(method: str, url: str, token: str, body: dict | None = None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()) if resp.status not in (204, 201) else {}
    except urllib.error.HTTPError as e:
        print(f"ERROR {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--token", required=True, help="GitHub PAT with repo/secrets scope")
    p.add_argument("--repo", required=True, help="owner/repo (ex: 5906375/EIAH)")
    p.add_argument("--staging-url", required=True)
    p.add_argument("--staging-token", required=True)
    p.add_argument("--tenant-id", required=True)
    p.add_argument("--workspace-id", required=True)
    args = p.parse_args()

    base = f"https://api.github.com/repos/{args.repo}"

    # Buscar chave pública do repositório
    pubkey = github_request("GET", f"{base}/actions/secrets/public-key", args.token)
    key_id = pubkey["key_id"]
    key_b64 = pubkey["key"]
    print(f"Public key fetched: key_id={key_id}")

    secrets = {
        "STAGING_API_BASE_URL": args.staging_url,
        "STAGING_API_TOKEN": args.staging_token,
        "E2E_TENANT_ID": args.tenant_id,
        "E2E_WORKSPACE_ID": args.workspace_id,
    }

    for name, value in secrets.items():
        encrypted = encrypt_secret(key_b64, value)
        github_request(
            "PUT",
            f"{base}/actions/secrets/{name}",
            args.token,
            {"encrypted_value": encrypted, "key_id": key_id},
        )
        print(f"  SET {name}: OK")

    print("\nAll 4 secrets configured.")

    # Disparar workflow e2e-high-staging
    print("\nTriggering e2e-high-staging workflow...")
    github_request(
        "POST",
        f"{base}/actions/workflows/e2e-high-staging.yml/dispatches",
        args.token,
        {"ref": "main", "inputs": {"agent_id": "imob"}},
    )
    print("Workflow dispatched. Check: https://github.com/{}/actions".format(args.repo))


if __name__ == "__main__":
    main()
