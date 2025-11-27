"""Generate a presigned S3 URL that lets the frontend download an image."""
import base64
import json
import logging
import os

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

S3_BUCKET = os.environ.get("DOWNLOAD_BUCKET") or os.environ.get(
    "UPLOAD_BUCKET", "menumatch-labeler-uploads"
)
URL_EXPIRATION_SECONDS = int(os.environ.get("URL_EXPIRATION_SECONDS", "900"))
AUTH_TOKEN = os.environ.get("AUTH_TOKEN")

s3_client = boto3.client("s3")

_DEFAULT_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
}


def _response(status_code, payload):
    """Standardize API Gateway style responses with JSON and CORS headers."""
    return {
        "statusCode": status_code,
        "headers": _DEFAULT_HEADERS,
        "body": json.dumps(payload),
    }


def _parse_event_body(event):
    """Decode and parse the incoming JSON body, handling base64 if necessary."""
    body = (event or {}).get("body")
    if body is None:
        return {}

    if event.get("isBase64Encoded"):
        body = base64.b64decode(body)

    if isinstance(body, bytes):
        body = body.decode("utf-8")

    body = body.strip()
    if not body:
        return {}

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError("Request body must be a valid JSON object.") from exc


def _extract_auth_token(event):
    """Pull the shared secret from headers or query string."""
    raw_headers = (event or {}).get("headers") or {}
    headers = {str(k).lower(): v for k, v in raw_headers.items()}
    token = headers.get("x-api-key")

    if not token:
        auth_header = headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token and (event or {}).get("queryStringParameters"):
        token = (event["queryStringParameters"] or {}).get("token")

    return token


def lambda_handler(event, _context):
    if (event or {}).get("httpMethod") == "OPTIONS":
        # Allow CORS preflight to succeed quickly.
        return {
            "statusCode": 204,
            "headers": _DEFAULT_HEADERS,
            "body": "",
        }

    if not S3_BUCKET:
        logger.error("Missing required env var DOWNLOAD_BUCKET/UPLOAD_BUCKET.")
        return _response(500, {"message": "Server is not configured for downloads."})

    if AUTH_TOKEN:
        provided_token = _extract_auth_token(event)
        if provided_token != AUTH_TOKEN:
            logger.warning("Unauthorized request: missing or invalid token.")
            return _response(401, {"message": "Unauthorized"})

    try:
        payload = _parse_event_body(event)
    except ValueError as exc:
        return _response(400, {"message": str(exc)})

    object_key = payload.get("objectKey")
    bucket = payload.get("bucket") or S3_BUCKET

    if not object_key:
        return _response(400, {"message": "Field 'objectKey' is required."})

    params = {"Bucket": bucket, "Key": object_key}

    try:
        download_url = s3_client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=URL_EXPIRATION_SECONDS
        )
    except ClientError as error:
        logger.exception("Unable to generate presigned download URL: %s", error)
        return _response(
            500, {"message": "Could not generate download URL. Please retry later."}
        )

    response_payload = {
        "downloadUrl": download_url,
        "method": "GET",
        "objectKey": object_key,
        "bucket": bucket,
        "expiresIn": URL_EXPIRATION_SECONDS,
    }

    return _response(200, response_payload)
