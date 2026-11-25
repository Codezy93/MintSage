"""ASGI authentication boundary for the MintSage agent service."""
import hmac
from uuid import UUID


class ServiceAuthentication:
    def __init__(self, app, secret: str):
        if not secret:
            raise ValueError("Missing AGENT_SERVICE_SECRET")
        self.app = app
        self.credential = f"Bearer {secret}".encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            return await self.app(scope, receive, send)
        if scope["type"] != "http":
            await send({"type": "websocket.close", "code": 1008})
            return
        headers = dict(scope["headers"])
        if hmac.compare_digest(headers.get(b"authorization", b""), self.credential):
            try:
                user_id = UUID(headers[b"x-mintsage-user"].decode("ascii"))
            except (KeyError, ValueError):
                pass
            else:
                state = {**scope.get("state", {}), "user_id": str(user_id)}
                return await self.app({**scope, "state": state}, receive, send)
        await send({"type": "http.response.start", "status": 401, "headers": []})
        await send({"type": "http.response.body", "body": b"Authentication required"})
