"""Generate a presigned S3 URL that lets the frontend upload an image."""
import base64
import json
import logging
import os
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

S3_BUCKET = os.environ.get("UPLOAD_BUCKET", "menumatch-labeler-uploads")
UPLOAD_PREFIX = os.environ.get("UPLOAD_PREFIX", "v1/")
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


def _build_object_key(filename, prefix):
    """Generate a collision-resistant S3 object key."""
    safe_name = Path(filename or "").name
    extension = Path(safe_name).suffix
    unique_id = uuid4().hex
    normalized_prefix = prefix.strip("/")
    if normalized_prefix:
        normalized_prefix = f"{normalized_prefix}/"

    final_name = f"{unique_id}{extension}"
    return f"{normalized_prefix}{final_name}"


def lambda_handler(event, _context):
    if (event or {}).get("httpMethod") == "OPTIONS":
        # Allow CORS preflight to succeed quickly.
        return {
            "statusCode": 204,
            "headers": _DEFAULT_HEADERS,
            "body": "",
        }

    if not S3_BUCKET:
        logger.error("Missing required env var UPLOAD_BUCKET.")
        return _response(500, {"message": "Server is not configured for uploads."})

    if AUTH_TOKEN:
        provided_token = _extract_auth_token(event)
        if provided_token != AUTH_TOKEN:
            logger.warning("Unauthorized request: missing or invalid token.")
            return _response(401, {"message": "Unauthorized"})

    try:
        payload = _parse_event_body(event)
    except ValueError as exc:
        return _response(400, {"message": str(exc)})

    original_filename = payload.get("filename")
    content_type = payload.get("contentType")

    if not original_filename:
        return _response(400, {"message": "Field 'filename' is required."})

    object_key = payload.get("objectKey") or _build_object_key(
        original_filename, UPLOAD_PREFIX
    )

    params = {"Bucket": S3_BUCKET, "Key": object_key}
    if content_type:
        params["ContentType"] = content_type

    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object", Params=params, ExpiresIn=URL_EXPIRATION_SECONDS
        )
    except ClientError as error:
        logger.exception("Unable to generate presigned URL: %s", error)
        return _response(
            500, {"message": "Could not generate upload URL. Please retry later."}
        )

    response_payload = {
        "uploadUrl": upload_url,
        "method": "PUT",
        "objectKey": object_key,
        "bucket": S3_BUCKET,
        "expiresIn": URL_EXPIRATION_SECONDS,
    }

    if content_type:
        response_payload["headers"] = {"Content-Type": content_type}

    return _response(200, response_payload)
