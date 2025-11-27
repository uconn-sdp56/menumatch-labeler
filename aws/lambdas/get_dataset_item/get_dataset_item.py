"""Return a single dataset item from DynamoDB by objectKey."""
import json
import logging
import os
from decimal import Decimal
from urllib.parse import unquote

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("METADATA_TABLE", "mml-metadata")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN")

dynamodb = boto3.resource("dynamodb")
metadata_table = dynamodb.Table(TABLE_NAME) if TABLE_NAME else None

_DEFAULT_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET",
}


def _response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": _DEFAULT_HEADERS,
        "body": json.dumps(payload),
    }


def _extract_auth_token(event):
    raw_headers = (event or {}).get("headers") or {}
    headers = {str(key).lower(): value for key, value in raw_headers.items()}
    token = headers.get("x-api-key")

    if not token:
        auth_header = headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token and (event or {}).get("queryStringParameters"):
        token = (event["queryStringParameters"] or {}).get("token")

    return token


def _to_serializable(value):
    if isinstance(value, dict):
        return {key: _to_serializable(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_to_serializable(item) for item in value]
    if isinstance(value, Decimal):
        if value % 1 == 0:
            return int(value)
        return float(value)
    return value


def _get_object_key(event):
    path_params = (event or {}).get("pathParameters") or {}
    raw_key = (
        path_params.get("objectKey")
        or path_params.get("objectKey+")
        or path_params.get("proxy")
    )

    if not raw_key and (event or {}).get("queryStringParameters"):
        raw_key = (event["queryStringParameters"] or {}).get("objectKey")

    if raw_key is None:
        return ""

    try:
        return unquote(str(raw_key))
    except Exception:
        return str(raw_key)


def lambda_handler(event, _context):
    if (event or {}).get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": _DEFAULT_HEADERS,
            "body": "",
        }

    if not TABLE_NAME:
        logger.error("Missing required env var METADATA_TABLE.")
        return _response(500, {"message": "Server is not configured for dataset access."})

    if metadata_table is None:
        logger.error("DynamoDB metadata table handle is not initialized.")
        return _response(500, {"message": "Server is not configured for dataset access."})

    http_method = (event or {}).get("httpMethod")
    if http_method and http_method != "GET":
        return _response(405, {"message": f"Method {http_method} not allowed."})

    if AUTH_TOKEN:
        provided_token = _extract_auth_token(event)
        if provided_token != AUTH_TOKEN:
            logger.warning("Unauthorized dataset request.")
            return _response(401, {"message": "Unauthorized"})

    object_key = _get_object_key(event)
    if not object_key:
        return _response(400, {"message": "objectKey path parameter is required."})

    try:
        result = metadata_table.get_item(Key={"objectKey": object_key})
    except ClientError as error:
        logger.exception("Failed to read metadata for objectKey=%s: %s", object_key, error)
        return _response(500, {"message": "Could not read dataset. Try again later."})

    if "Item" not in result:
        return _response(404, {"message": "Dataset item not found."})

    item = _to_serializable(result["Item"])

    return _response(200, {"item": item})
