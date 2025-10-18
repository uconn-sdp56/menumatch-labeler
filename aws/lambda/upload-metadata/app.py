"""Persist labeling metadata for an uploaded plate image in DynamoDB."""
import base64
import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("METADATA_TABLE", "mml-metadata")
AUTH_TOKEN = os.environ.get("UPLOAD_AUTH_TOKEN")

dynamodb = boto3.resource("dynamodb")
metadata_table = dynamodb.Table(TABLE_NAME) if TABLE_NAME else None

_DEFAULT_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Upload-Token,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
}


def _response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": _DEFAULT_HEADERS,
        "body": json.dumps(payload),
    }


def _parse_event_body(event):
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
    raw_headers = (event or {}).get("headers") or {}
    headers = {str(key).lower(): value for key, value in raw_headers.items()}
    token = headers.get("x-upload-token")

    if not token:
        auth_header = headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token and (event or {}).get("queryStringParameters"):
        token = (event["queryStringParameters"] or {}).get("token")

    return token


def _normalize_servings(value):
    if value is None or value == "":
        raise ValueError("servings is required for each item.")

    if isinstance(value, (int, float, Decimal)):
        numeric = Decimal(str(value))
    elif isinstance(value, str):
        try:
            numeric = Decimal(value.strip())
        except InvalidOperation as exc:
            raise ValueError(f"Invalid servings value '{value}'.") from exc
    else:
        raise ValueError("servings must be a number.")

    if numeric < 0:
        raise ValueError("servings cannot be negative.")

    return numeric


def _validate_payload(payload):
    required_fields = ["objectKey", "mealtime", "date", "diningHallId", "difficulty"]
    missing = [field for field in required_fields if not payload.get(field)]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    items = payload.get("items")
    if not isinstance(items, list) or len(items) == 0:
        raise ValueError("Payload must include at least one menu item.")

    normalized_items = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Item #{index} must be an object.")

        menu_item_id = item.get("menuItemId")
        if not menu_item_id:
            raise ValueError(f"Item #{index} is missing 'menuItemId'.")

        servings = _normalize_servings(item.get("servings"))

        normalized_items.append(
            {
                "menuItemId": str(menu_item_id),
                "servings": servings,
            }
        )

    return normalized_items


def lambda_handler(event, _context):
    if (event or {}).get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": _DEFAULT_HEADERS,
            "body": "",
        }

    if not TABLE_NAME:
        logger.error("Missing required env var METADATA_TABLE.")
        return _response(500, {"message": "Server is not configured for metadata."})

    if AUTH_TOKEN:
        provided_token = _extract_auth_token(event)
        if provided_token != AUTH_TOKEN:
            logger.warning("Unauthorized metadata request.")
            return _response(401, {"message": "Unauthorized"})

    try:
        payload = _parse_event_body(event)
    except ValueError as exc:
        return _response(400, {"message": str(exc)})

    try:
        normalized_items = _validate_payload(payload)
    except ValueError as exc:
        return _response(400, {"message": str(exc)})

    now = datetime.now(timezone.utc)

    item = {
        "objectKey": payload["objectKey"],
        "bucket": payload.get("bucket"),
        "mealtime": payload["mealtime"],
        "mealDate": payload["date"],
        "diningHallId": str(payload["diningHallId"]),
        "difficulty": payload["difficulty"],
        "items": normalized_items,
        "createdAt": now.isoformat(),
    }

    # Strip empty optional nested fields to keep the record tidy.
    if not item["bucket"]:
        item.pop("bucket")

    try:
        metadata_table.put_item(
            Item=item,
            ConditionExpression=Attr("objectKey").not_exists(),
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.warning("Metadata already exists for objectKey=%s", payload["objectKey"])
            return _response(
                409, {"message": "Metadata already recorded for this upload."}
            )
        logger.exception("Failed to write metadata: %s", error)
        return _response(500, {"message": "Could not save metadata. Try again later."})

    return _response(
        201,
        {
            "objectKey": payload["objectKey"],
            "createdAt": item["createdAt"],
        },
    )
