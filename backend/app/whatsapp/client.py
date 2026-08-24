"""
Evolution API WhatsApp client.
Replaces the Meta Cloud API client with Evolution API (self-hosted / cloud).

Evolution API docs: https://doc.evolution-api.com
Endpoints used:
  POST /message/sendText/{instance}
  POST /message/sendMedia/{instance}
  POST /message/sendReadStatus/{instance}   (read receipts)
  GET  /instance/connectionState/{instance}
  GET  /instance/connect/{instance}         (QR code)
  POST /instance/create
  DELETE /instance/delete/{instance}
"""

import httpx
from app.config import settings


def _evo_base() -> str:
    return settings.evolution_api_url.rstrip("/")


def _headers() -> dict:
    return {
        "apikey": settings.evolution_api_key,
        "Content-Type": "application/json",
    }


async def _post(path: str, payload: dict) -> dict:
    url = f"{_evo_base()}{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=_headers())
        response.raise_for_status()
        return response.json()


async def _get(path: str) -> dict:
    url = f"{_evo_base()}{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=_headers())
        response.raise_for_status()
        return response.json()


async def _delete(path: str) -> dict:
    url = f"{_evo_base()}{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.delete(url, headers=_headers())
        response.raise_for_status()
        return response.json()


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

async def send_text_message(instance_name: str, to: str, text: str) -> dict:
    """Send a plain text message via Evolution API."""
    return await _post(f"/message/sendText/{instance_name}", {
        "number": to,
        "textMessage": {"text": text},
        "options": {"delay": 1000, "presence": "composing"},
    })


async def send_image_message(instance_name: str, to: str, image_url: str, caption: str = "") -> dict:
    """Send an image from a public URL."""
    return await _post(f"/message/sendMedia/{instance_name}", {
        "number": to,
        "mediatype": "image",
        "mimetype": "image/jpeg",
        "caption": caption,
        "media": image_url,
        "fileName": "image.jpg",
        "options": {"delay": 1000},
    })


async def send_document_message(instance_name: str, to: str, doc_url: str, filename: str) -> dict:
    """Send a document (PDF, etc.) from a public URL."""
    return await _post(f"/message/sendMedia/{instance_name}", {
        "number": to,
        "mediatype": "document",
        "mimetype": "application/pdf",
        "caption": "",
        "media": doc_url,
        "fileName": filename,
        "options": {"delay": 1000},
    })


async def send_read_receipt(instance_name: str, remote_jid: str, message_id: str) -> dict:
    """Mark a message as read (blue ticks)."""
    try:
        return await _post(f"/message/sendReadStatus/{instance_name}", {
            "readMessages": [{"id": message_id, "remoteJid": remote_jid, "fromMe": False}],
        })
    except Exception:
        return {}


async def send_typing_indicator(instance_name: str, to: str) -> dict:
    """Show 'typing...' presence via Evolution API."""
    try:
        return await _post(f"/message/sendPresence/{instance_name}", {
            "number": to,
            "options": {"presence": "composing", "delay": 2000},
        })
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Instance management
# ---------------------------------------------------------------------------

async def create_instance(instance_name: str, webhook_url: str) -> dict:
    """Create a new WhatsApp instance on the Evolution API server."""
    return await _post("/instance/create", {
        "instanceName": instance_name,
        "qrcode": True,
        "integration": "WHATSAPP-BAILEYS",
        "webhook": {
            "url": webhook_url,
            "byEvents": False,
            "base64": False,
            "events": [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "CONNECTION_UPDATE",
            ],
        },
    })


async def get_qr_code(instance_name: str) -> dict:
    """Fetch the current QR code for an instance. Returns base64 image."""
    return await _get(f"/instance/connect/{instance_name}")


async def get_connection_state(instance_name: str) -> dict:
    """Check if an instance is connected (open/connecting/close)."""
    try:
        return await _get(f"/instance/connectionState/{instance_name}")
    except Exception as e:
        return {"state": "error", "error": str(e)}


async def restart_instance(instance_name: str) -> dict:
    """Restart (reconnect) an instance."""
    return await _post(f"/instance/restart/{instance_name}", {})


async def logout_instance(instance_name: str) -> dict:
    """Log out from WhatsApp on the instance."""
    return await _post(f"/instance/logout/{instance_name}", {})


async def delete_instance(instance_name: str) -> dict:
    """Permanently delete an instance."""
    return await _delete(f"/instance/delete/{instance_name}")


async def list_instances() -> list:
    """List all instances on the Evolution API server."""
    try:
        result = await _get("/instance/fetchInstances")
        if isinstance(result, list):
            return result
        return result.get("instances", [])
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Media download (for inbound media from Evolution API)
# ---------------------------------------------------------------------------

async def get_media_base64(instance_name: str, message_id: str, convert_to_mp4: bool = False) -> dict:
    """
    Download media from an inbound message as base64.
    Evolution API: GET /chat/getBase64FromMediaMessage/{instance}
    """
    return await _post(f"/chat/getBase64FromMediaMessage/{instance_name}", {
        "message": {"key": {"id": message_id}},
        "convertToMp4": convert_to_mp4,
    })


def verify_webhook_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """
    Evolution API uses an API key in the header instead of HMAC signatures.
    The webhook endpoint validates the apikey header directly.
    This function is kept for interface compatibility but always returns True —
    actual authentication is handled at the endpoint level.
    """
    return True
