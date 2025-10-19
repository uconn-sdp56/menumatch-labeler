"""Return dataset metadata stored in DynamoDB for MenuMatch labeling."""
import json
import logging
import os
from decimal import Decimal

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

    scan_kwargs = {}
    collected_items = []
    total_scanned = 0

    try:
        while True:
            result = metadata_table.scan(**scan_kwargs)
            raw_items = result.get("Items", [])
            collected_items.extend(_to_serializable(item) for item in raw_items)
            total_scanned += result.get("ScannedCount", len(raw_items))

            last_evaluated_key = result.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break

            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
    except ClientError as error:
        logger.exception("Failed to scan metadata table: %s", error)
        return _response(500, {"message": "Could not read dataset. Try again later."})

    return _response(
        200,
        {
            "items": collected_items,
            "count": len(collected_items),
            "scannedCount": total_scanned,
        },
    )
