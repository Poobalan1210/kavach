"""Build the web app against the deployed stack and publish it to Amplify Hosting.

  1. web/.env.production from the stack outputs (API URL, Cognito pool and client)
  2. web/public/data from the latest benchmark results
  3. next build (static export to web/out)
  4. zip web/out and upload it as a manual Amplify deployment

Usage: python scripts/build_web.py [--no-deploy]
"""

import io
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kavach_client import REGION, outputs  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def main() -> None:
    o = outputs()
    (WEB / ".env.production").write_text(
        f"NEXT_PUBLIC_API_URL={o['ApiUrl']}\n"
        f"NEXT_PUBLIC_USER_POOL_ID={o['UserPoolId']}\n"
        f"NEXT_PUBLIC_USER_POOL_CLIENT_ID={o['UserPoolClientId']}\n"
    )
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_web_data.py")], check=True)
    subprocess.run(["npm", "run", "build"], cwd=WEB, check=True)
    if "--no-deploy" in sys.argv:
        print(f"built {WEB / 'out'}")
        return

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in (WEB / "out").rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(WEB / "out"))
    amp = boto3.client("amplify", region_name=REGION)
    app_id = o["WebAppId"]
    dep = amp.create_deployment(appId=app_id, branchName="main")
    req = urllib.request.Request(dep["zipUploadUrl"], data=buf.getvalue(), method="PUT", headers={"Content-Type": "application/zip"})
    urllib.request.urlopen(req, timeout=120).read()
    amp.start_deployment(appId=app_id, branchName="main", jobId=dep["jobId"])
    for _ in range(60):
        status = amp.get_job(appId=app_id, branchName="main", jobId=dep["jobId"])["job"]["summary"]["status"]
        if status in ("SUCCEED", "FAILED", "CANCELLED"):
            break
        time.sleep(5)
    print(f"Amplify deployment {status}: {o['WebUrl']}")
    if status != "SUCCEED":
        sys.exit(1)


if __name__ == "__main__":
    main()
