import asyncio
import httpx
import os
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
LESSON_FILES = [
    "c:/Users/Oliver/Desktop/KingHacks26/lesson_plan_multiplication.md",
    "c:/Users/Oliver/Desktop/KingHacks26/lesson_plan_addition.md",
    "c:/Users/Oliver/Desktop/KingHacks26/lesson_plan_subtraction.md",
    "c:/Users/Oliver/Desktop/KingHacks26/lesson_plan_english.md"
]

async def seed():
    async with httpx.AsyncClient() as client:
        # 1. Get a teacher account
        print("Fetching dev accounts...")
        resp = await client.get(f"{BASE_URL}/accounts/dev/all")
        if resp.status_code != 200:
            print(f"Failed to get accounts: {resp.status_code}")
            return

        accounts = resp.json().get("accounts", [])
        teacher = next((a for a in accounts if a["account_type"] == "teacher"), None)

        token = None
        if teacher:
            print(f"Found teacher: {teacher['username']}")
            # Switch to teacher
            resp = await client.post(f"{BASE_URL}/accounts/dev/switch/{teacher['username']}")
            if resp.status_code == 200:
                token = resp.json()["access_token"]
                print("Logged in as teacher.")
            else:
                print("Failed to switch to teacher.")
        else:
            print("No teacher found. Creating one...")
            # Register a teacher
            reg_data = {
                "username": "seed_teacher",
                "full_name": "Seed Teacher",
                "email": "seed@teacher.com",
                "password": "password123",
                "account_type": "teacher"
            }
            resp = await client.post(f"{BASE_URL}/accounts/register", json=reg_data)
            if resp.status_code in [200, 201]:
                print("Created teacher.")
                # Login
                resp = await client.post(f"{BASE_URL}/accounts/signin/token", data={
                    "username": "seed_teacher",
                    "password": "password123"
                })
                if resp.status_code == 200:
                    token = resp.json()["access_token"]
                    print("Logged in as new teacher.")
            else:
                try:
                    # Maybe already exists
                    resp = await client.post(f"{BASE_URL}/accounts/signin/token", data={
                        "username": "seed_teacher",
                        "password": "password123"
                    })
                    if resp.status_code == 200:
                         token = resp.json()["access_token"]
                         print("Logged in as existing seed_teacher.")
                except:
                     print(f"Failed to create/login teacher: {resp.text}")

        if not token:
            print("Could not get a token. Aborting.")
            return

        # 2. Upload Files
        headers = {"Authorization": f"Bearer {token}"}
        
        files_to_upload = []
        opened_files = []
        
        for path_str in LESSON_FILES:
            path = Path(path_str)
            if not path.exists():
                print(f"File not found: {path}")
                continue
            
            f = open(path, "rb")
            opened_files.append(f)
            files_to_upload.append(("files", (path.name, f, "text/markdown")))

        if not files_to_upload:
            print("No files to upload.")
            return

        print(f"Uploading {len(files_to_upload)} lessons...")
        try:
            resp = await client.post(f"{BASE_URL}/teacher/upload", headers=headers, files=files_to_upload, timeout=120.0)
            if resp.status_code == 200:
                print("Upload success!")
                print(resp.json())
            else:
                print(f"Upload failed: {resp.status_code} - {resp.text}")
        finally:
            for f in opened_files:
                f.close()

if __name__ == "__main__":
    asyncio.run(seed())
