
import os
import json
import time
import base64
import jwt
import httpx

from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

KEY_PATH = os.getenv("YANDEX_SERVICE_ACCOUNT_KEY_JSON")
FOLDER_ID = os.getenv("YANDEX_CLOUD_FOLDER_ID")

IAM_URL = "https://iam.api.cloud.yandex.net/iam/v1/tokens"
VISION_URL = "https://ai.api.cloud.yandex.net/ocr/v1/recognizeText"


def load_sa_key():
    if not KEY_PATH:
        raise ValueError(
            "Не задан YANDEX_SERVICE_ACCOUNT_KEY_JSON"
        )

    path = Path(KEY_PATH)

    if not path.is_absolute():
        path = Path.cwd() / path

    if not path.exists():
        raise FileNotFoundError(
            f"Файл ключа не найден: {path}"
        )

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def make_jwt_token(sa_key):
    now = int(time.time())

    payload = {
        "iss": sa_key["service_account_id"],
        "aud": IAM_URL,
        "iat": now,
        "exp": now + 360
    }

    return jwt.encode(
        payload,
        sa_key["private_key"],
        algorithm="PS256",
        headers={"kid": sa_key["id"]}
    )


async def get_iam_token():
    sa_key = load_sa_key()
    jwt_token = make_jwt_token(sa_key)

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            IAM_URL,
            json={"jwt": jwt_token}
        )

        response.raise_for_status()

        return response.json()["iamToken"]


async def recognize_image(
    image_bytes: bytes,
    mime_type: str = "JPEG"
) -> str:

    if not FOLDER_ID:
        raise ValueError(
            "Не задан YANDEX_CLOUD_FOLDER_ID"
        )

    if not image_bytes:
        raise ValueError("Изображение пустое")

    iam_token = await get_iam_token()

    content = base64.b64encode(
        image_bytes
    ).decode("utf-8")

    payload = {
        "mimeType": mime_type,
        "languageCodes": ["ru", "en"],
        "model": "handwritten",
        "content": content
    }

    headers = {
        "Authorization": f"Bearer {iam_token}",
        "x-folder-id": FOLDER_ID,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            VISION_URL,
            headers=headers,
            json=payload
        )

        response.raise_for_status()

        data = response.json()

        if "error" in data:
            raise RuntimeError(str(data["error"]))

        result = data.get("result", {})

        if "error" in result:
            raise RuntimeError(str(result["error"]))

        text_annotation = result.get(
            "textAnnotation", {}
        )

        full_text = text_annotation.get(
            "fullText", ""
        )

        print("[OCR] Распознанный текст:")
        print(full_text)

        return full_text
