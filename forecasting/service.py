import os

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from agent_service.auth import ServiceAuthentication

from .contract import History, Projection, project


def create_app() -> ServiceAuthentication:
    app = FastAPI()

    @app.exception_handler(RequestValidationError)
    async def invalid_history(request, error):
        return JSONResponse({"error": "Expected 60 consecutive USD daily amounts"}, status_code=422)

    @app.post("/forecast")
    async def forecast(history: History) -> Projection:
        return project(history)

    return ServiceAuthentication(app, os.environ["AGENT_SERVICE_SECRET"])
