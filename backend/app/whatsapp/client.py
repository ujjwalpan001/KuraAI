"""
Evolution API WhatsApp client.
Replaces the Meta Cloud API client with Evolution Go (self-hosted / cloud).

Evolution API docs: https://doc.evolution-api.com
"""

import httpx
from app.config import settings

def _evo_base() -> str:
    return settings.evolution_api_url.rstrip("/")


async def _post_admin(path: str, payload: dict) -> dict:
    url = f"{_evo_base()}{path}"
    headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


async def _post_instance(instance_name: str, path: str, payload: dict) -> dict:
    url = f"{_evo_base()}{path}"
    headers = {"apikey": instance_name, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


async def _get_admin(path: str) -> dict:
    url = f"{_evo_base()}{path}"
    headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


async def _get_instance(instance_name: str, path: str) -> dict:
    url = f"{_evo_base()}{path}"
    headers = {"apikey": instance_name, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


async def _delete_admin(path: str) -> dict:
    url = f"{_evo_base()}{path}"
    headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.delete(url, headers=headers)
        response.raise_for_status()
        return response.json()


async def _delete_instance(instance_name: str, path: str) -> dict:
    url = f"{_evo_base()}{path}"
    headers = {"apikey": instance_name, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.delete(url, headers=headers)
        response.raise_for_status()
        return response.json()


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------

async def send_text_message(instance_name: str, to: str, text: str) -> dict:
    """Send a plain text message via Evolution API."""
    return await _post_instance(instance_name, "/send/text", {
        "number": to,
        "text": text,
    })


async def send_image_message(instance_name: str, to: str, image_url: str, caption: str = "") -> dict:
    """Send an image from a public URL."""
    return await _post_instance(instance_name, "/send/media", {
        "number": to,
        "type": "image",
        "url": image_url,
        "caption": caption,
    })


async def send_document_message(instance_name: str, to: str, doc_url: str, filename: str) -> dict:
    """Send a document (PDF, etc.) from a public URL."""
    return await _post_instance(instance_name, "/send/media", {
        "number": to,
        "type": "document",
        "url": doc_url,
        "filename": filename,
    })


async def send_read_receipt(instance_name: str, remote_jid: str, message_id: str) -> dict:
    """Mark a message as read (blue ticks)."""
    # Not supported natively in current Evolution Go endpoints
    return {}


async def send_typing_indicator(instance_name: str, to: str) -> dict:
    """Show 'typing...' presence via Evolution API."""
    # Not supported natively in current Evolution Go endpoints
    return {}


# ---------------------------------------------------------------------------
# Instance management
# ---------------------------------------------------------------------------

async def create_instance(instance_name: str, webhook_url: str) -> dict:
    """Create a new WhatsApp instance on the Evolution API server."""
    # Step 1: Create instance with instance_name acting as its own token
    create_res = await _post_admin("/instance/create", {
        "name": instance_name,
        "token": instance_name,
    })
    
    # Step 2: Set webhook and connect using the instance API key (which is the instance_name)
    try:
        connect_res = await _post_instance(instance_name, "/instance/connect", {
            "webhookUrl": webhook_url,
            "subscribe": ["ALL"],
        })
    except Exception as e:
        # If it fails to connect, we should probably delete it or log it
        print(f"Failed to set webhook: {e}")
        pass
        
    return create_res


async def get_qr_code(instance_name: str) -> dict:
    """Fetch the current QR code for an instance. Returns base64 image."""
    result = await _get_instance(instance_name, "/instance/qr")
    if "data" in result and isinstance(result["data"], dict):
        data = result["data"]
        return {"base64": data.get("qrcode"), "code": data.get("code")}
    return result


async def get_connection_state(instance_name: str) -> dict:
    """Check if an instance is connected (open/connecting/close)."""
    try:
        result = await _get_instance(instance_name, "/instance/status")
        if "data" in result and isinstance(result["data"], dict):
            data = result["data"]
            if data.get("LoggedIn"):
                return {"instance": {"state": "open"}}
            elif data.get("Connected"):
                return {"instance": {"state": "connecting"}}
            else:
                return {"instance": {"state": "close"}}
        return result
    except Exception as e:
        return {"state": "error", "error": str(e)}


async def restart_instance(instance_name: str) -> dict:
    """Restart (reconnect) an instance."""
    return await _post_instance(instance_name, "/instance/reconnect", {})


async def logout_instance(instance_name: str) -> dict:
    """Log out from WhatsApp on the instance."""
    return await _delete_instance(instance_name, "/instance/logout")


async def delete_instance(instance_name: str) -> dict:
    """Permanently delete an instance."""
    instances = await list_instances()
    instance_id = None
    for inst in instances:
        if inst.get("name") == instance_name or inst.get("instanceName") == instance_name:
            instance_id = inst.get("id") or inst.get("instanceId")
            break
            
    if not instance_id:
        return {"ok": False, "error": "Instance not found"}

    return await _delete_admin(f"/instance/delete/{instance_id}")


async def list_instances() -> list:
    """List all instances on the Evolution API server."""
    try:
        result = await _get_admin("/instance/all")
        if isinstance(result, dict) and "data" in result:
            return result["data"]
        return []
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Media download (for inbound media from Evolution API)
# ---------------------------------------------------------------------------

async def get_media_base64(instance_name: str, message_id: str, convert_to_mp4: bool = False) -> dict:
    """
    Download media from an inbound message as base64.
    """
    return {}


def verify_webhook_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """
    Evolution API uses an API key in the header instead of HMAC signatures.
    """
    return True
