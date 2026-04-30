"""Guestimate endpoints for human nutrition-estimation benchmarks."""
import base64
import json
import logging
import math
import os
import random
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

METADATA_TABLE_NAME = os.environ.get("METADATA_TABLE", "mml-metadata")
GUESTIMATE_TABLE_NAME = os.environ.get("GUESTIMATE_TABLE", "mml-guestimates")
S3_BUCKET = os.environ.get("UPLOAD_BUCKET", "")
URL_EXPIRATION_SECONDS = int(os.environ.get("URL_EXPIRATION_SECONDS", "900"))
AUTH_TOKEN = os.environ.get("AUTH_TOKEN")
HUSKYEATS_BASE_URL = os.environ.get(
    "HUSKYEATS_BASE_URL", "https://husky-eats.onrender.com/api"
).rstrip("/")

MACRO_FIELDS = ("kcal", "protein_g", "carb_g", "fat_g")
PERCENT_MIN_GROUND_TRUTH = {
    "kcal": 100.0,
    "protein_g": 5.0,
    "carb_g": 5.0,
    "fat_g": 5.0,
}
GUESS_ALIASES = {
    "kcal": ("kcal", "calories", "calories_kcal"),
    "protein_g": ("protein_g", "protein", "proteins", "proteinGrams"),
    "carb_g": ("carb_g", "carbs", "carbohydrates", "carbohydrate_g"),
    "fat_g": ("fat_g", "fat", "fats", "totalfat_g"),
}

dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")
metadata_table = (
    dynamodb.Table(METADATA_TABLE_NAME) if METADATA_TABLE_NAME else None
)
guestimate_table = (
    dynamodb.Table(GUESTIMATE_TABLE_NAME) if GUESTIMATE_TABLE_NAME else None
)
nutrition_cache = {}

_DEFAULT_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
}


def _response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": _DEFAULT_HEADERS,
        "body": json.dumps(payload),
    }


def _http_method(event):
    return (
        (event or {}).get("httpMethod")
        or ((event or {}).get("requestContext") or {})
        .get("http", {})
        .get("method")
        or ""
    ).upper()


def _path(event):
    return (event or {}).get("rawPath") or (event or {}).get("path") or ""


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
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError("Request body must be a valid JSON object.") from exc

    if not isinstance(payload, dict):
        raise ValueError("Request body must be a valid JSON object.")

    return payload


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


def _to_decimal(value, field_name):
    if value is None or value == "":
        raise ValueError(f"{field_name} is required.")

    try:
        numeric = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError(f"{field_name} must be a number.") from exc

    if not numeric.is_finite():
        raise ValueError(f"{field_name} must be finite.")
    if numeric < 0:
        raise ValueError(f"{field_name} cannot be negative.")

    return numeric


def _to_float(value, field_name):
    numeric = _to_decimal(value, field_name)
    return float(numeric)


def _to_dynamodb(value):
    if isinstance(value, dict):
        return {
            key: _to_dynamodb(val)
            for key, val in value.items()
            if val is not None
        }
    if isinstance(value, list):
        return [_to_dynamodb(item) for item in value if item is not None]
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return Decimal(str(round(value, 6)))
    if isinstance(value, int):
        return Decimal(str(value))
    return value


def _scan_all(table):
    items = []
    scan_kwargs = {}

    while True:
        result = table.scan(**scan_kwargs)
        items.extend(result.get("Items", []))

        last_evaluated_key = result.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key

    return items


def _sorted_dataset_items():
    raw_items = _scan_all(metadata_table)
    items = [
        _to_serializable(item)
        for item in raw_items
        if item.get("objectKey")
    ]

    def sort_key(item):
        return (
            str(item.get("createdAt") or ""),
            str(item.get("objectKey") or ""),
        )

    return sorted(items, key=sort_key)


def _ordered_dataset_items(seed=None):
    items = _sorted_dataset_items()
    if seed:
        random.Random(str(seed)).shuffle(items)
    return items


def _sample_payload(record, index, total_count):
    object_key = record["objectKey"]
    bucket = record.get("bucket") or S3_BUCKET
    if not bucket:
        raise RuntimeError("No S3 bucket is configured for sample images.")

    download_url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": object_key},
        ExpiresIn=URL_EXPIRATION_SECONDS,
    )

    return {
        "index": index,
        "totalCount": total_count,
        "hasNext": index + 1 < total_count,
        "sample": {
            "objectKey": object_key,
            "bucket": bucket,
            "imageUrl": download_url,
            "expiresIn": URL_EXPIRATION_SECONDS,
            "mealDate": record.get("mealDate"),
            "mealtime": record.get("mealtime"),
            "diningHallId": record.get("diningHallId"),
            "difficulty": record.get("difficulty"),
        },
    }


def _handle_get_sample(event):
    params = (event or {}).get("queryStringParameters") or {}
    raw_index = params.get("index", "0")
    seed = params.get("seed")

    try:
        index = int(raw_index)
    except (TypeError, ValueError):
        return _response(400, {"message": "index must be an integer."})

    if index < 0:
        return _response(400, {"message": "index cannot be negative."})

    try:
        dataset_items = _ordered_dataset_items(seed)
    except ClientError as error:
        logger.exception("Failed to scan metadata table: %s", error)
        return _response(500, {"message": "Could not read samples."})

    total_count = len(dataset_items)
    if total_count == 0:
        return _response(404, {"message": "No samples are available.", "totalCount": 0})
    if index >= total_count:
        return _response(
            404,
            {
                "message": "Sample index is outside the dataset.",
                "totalCount": total_count,
            },
        )

    try:
        return _response(200, _sample_payload(dataset_items[index], index, total_count))
    except ClientError as error:
        logger.exception("Failed to create sample image URL: %s", error)
        return _response(500, {"message": "Could not prepare sample image."})
    except RuntimeError as error:
        logger.error("Sample image configuration error: %s", error)
        return _response(500, {"message": str(error)})


def _get_metadata_item(object_key):
    result = metadata_table.get_item(Key={"objectKey": object_key})
    return result.get("Item")


def _fetch_nutrition(menu_item_id):
    key = str(menu_item_id)
    if key in nutrition_cache:
        return nutrition_cache[key]

    url = f"{HUSKYEATS_BASE_URL}/menuitem/{quote(key)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MenuMatch-Labeler-Guestimate/1.0",
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        logger.exception("Husky Eats returned HTTP %s for item %s", error.code, key)
        raise RuntimeError(f"Could not load nutrition for menu item {key}.") from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        logger.exception("Failed to fetch Husky Eats item %s: %s", key, error)
        raise RuntimeError(f"Could not load nutrition for menu item {key}.") from error

    nutrition = {
        "kcal": _to_float(payload.get("calories"), f"calories for item {key}"),
        "protein_g": _to_float(
            payload.get("protein_g"), f"protein_g for item {key}"
        ),
        "carb_g": _to_float(
            payload.get("totalcarbohydrate_g"),
            f"totalcarbohydrate_g for item {key}",
        ),
        "fat_g": _to_float(payload.get("totalfat_g"), f"totalfat_g for item {key}"),
    }

    nutrition_cache[key] = {
        "id": key,
        "name": str(payload.get("name") or ""),
        "servingSize": str(payload.get("servingsize") or ""),
        **nutrition,
    }
    return nutrition_cache[key]


def _ground_truth_nutrition(record):
    totals = {field: 0.0 for field in MACRO_FIELDS}
    source_items = []

    for index, item in enumerate(record.get("items") or [], start=1):
        if not isinstance(item, dict):
            continue

        menu_item_id = str(item.get("menuItemId") or "").strip()
        if not menu_item_id:
            continue

        servings = _to_float(item.get("servings"), f"servings for item #{index}")
        nutrition = _fetch_nutrition(menu_item_id)

        for field in MACRO_FIELDS:
            totals[field] += servings * float(nutrition[field])

        source_items.append(
            {
                "id": menu_item_id,
                "name": nutrition.get("name", ""),
                "servings": servings,
                "servingSize": nutrition.get("servingSize", ""),
                "nutritionPerServing": {
                    field: float(nutrition[field]) for field in MACRO_FIELDS
                },
            }
        )

    return totals, source_items


def _normalize_guess(payload):
    source = payload.get("guess") if isinstance(payload.get("guess"), dict) else payload
    guess = {}

    for canonical, aliases in GUESS_ALIASES.items():
        found = None
        for alias in aliases:
            if alias in source:
                found = source[alias]
                break
        guess[canonical] = _to_float(found, canonical)

    return guess


def _score_guess(guess, ground_truth):
    errors = {}
    for field in MACRO_FIELDS:
        signed_error = float(guess[field]) - float(ground_truth[field])
        absolute_error = abs(signed_error)
        percent_error = (
            absolute_error / float(ground_truth[field])
            if float(ground_truth[field]) > 0
            else None
        )
        errors[field] = {
            "signed": signed_error,
            "absolute": absolute_error,
            "percent": percent_error,
        }
    return errors


def _handle_post_guess(event):
    try:
        payload = _parse_event_body(event)
        object_key = str(payload.get("objectKey") or payload.get("sampleId") or "").strip()
        if not object_key:
            raise ValueError("objectKey is required.")
        guess = _normalize_guess(payload)
    except ValueError as error:
        return _response(400, {"message": str(error)})

    try:
        record = _get_metadata_item(object_key)
    except ClientError as error:
        logger.exception("Failed to read metadata for %s: %s", object_key, error)
        return _response(500, {"message": "Could not read sample metadata."})

    if not record:
        return _response(404, {"message": "Sample not found."})

    try:
        ground_truth, source_items = _ground_truth_nutrition(_to_serializable(record))
    except (RuntimeError, ValueError) as error:
        return _response(502, {"message": str(error)})

    errors = _score_guess(guess, ground_truth)
    now = datetime.now(timezone.utc).isoformat(timespec="microseconds")

    stored_item = {
        "sampleId": object_key,
        "guessedAt": now,
        "guess": guess,
        "groundTruth": ground_truth,
        "errors": errors,
        "sourceItems": source_items,
        "sampleMeta": {
            "bucket": record.get("bucket"),
            "mealDate": record.get("mealDate"),
            "mealtime": record.get("mealtime"),
            "diningHallId": record.get("diningHallId"),
            "difficulty": record.get("difficulty"),
        },
        "clientSessionId": payload.get("clientSessionId"),
        "createdAt": now,
    }

    try:
        guestimate_table.put_item(Item=_to_dynamodb(stored_item))
    except ClientError as error:
        logger.exception("Failed to write guestimate for %s: %s", object_key, error)
        return _response(500, {"message": "Could not save guess."})

    return _response(
        201,
        {
            "sampleId": object_key,
            "guessedAt": now,
            "guess": guess,
            "groundTruth": ground_truth,
            "errors": errors,
            "sourceItems": source_items,
        },
    )


def _compute_metrics(records):
    metrics = {}
    by_nutrient = {}

    for field in MACRO_FIELDS:
        abs_errors = []
        sq_errors = []
        perc_errors = []
        signed_errors = []
        low_ground_truth_exclusions = 0

        for record in records:
            ground_truth = record.get("groundTruth") or {}
            guess = record.get("guess") or {}
            if field not in ground_truth or field not in guess:
                continue

            ground_truth_value = float(ground_truth[field])
            predicted_value = float(guess[field])
            error = predicted_value - ground_truth_value
            abs_error = abs(error)

            signed_errors.append(error)
            abs_errors.append(abs_error)
            sq_errors.append(error * error)

            min_ground_truth = PERCENT_MIN_GROUND_TRUTH[field]
            if ground_truth_value < min_ground_truth:
                low_ground_truth_exclusions += 1
                continue

            percent_error = abs_error / ground_truth_value
            perc_errors.append(percent_error)

        mae = sum(abs_errors) / len(abs_errors) if abs_errors else 0.0
        rmse = math.sqrt(sum(sq_errors) / len(sq_errors)) if sq_errors else 0.0
        pmae = sum(perc_errors) / len(perc_errors) if perc_errors else None
        mean_error = (
            sum(signed_errors) / len(signed_errors) if signed_errors else 0.0
        )

        metrics[f"macro_mae_{field}"] = mae
        metrics[f"macro_rmse_{field}"] = rmse
        metrics[f"macro_pmae_{field}"] = pmae
        by_nutrient[field] = {
            "mae": mae,
            "rmse": rmse,
            "pmae": pmae,
            "meanError": mean_error,
            "count": len(abs_errors),
            "percentCount": len(perc_errors),
            "percentTotalCount": len(abs_errors),
            "percentExcludedCount": low_ground_truth_exclusions,
            "lowGroundTruthExcludedCount": low_ground_truth_exclusions,
        }

    return metrics, by_nutrient


def _handle_get_analysis():
    try:
        raw_records = _scan_all(guestimate_table)
    except ClientError as error:
        logger.exception("Failed to scan guestimate table: %s", error)
        return _response(500, {"message": "Could not read guestimate results."})

    records = [_to_serializable(record) for record in raw_records]
    metrics, by_nutrient = _compute_metrics(records)
    unique_samples = {record.get("sampleId") for record in records if record.get("sampleId")}

    latest = sorted(
        records,
        key=lambda record: str(record.get("guessedAt") or ""),
        reverse=True,
    )[:10]

    return _response(
        200,
        {
            "guessCount": len(records),
            "sampleCount": len(unique_samples),
            "metrics": metrics,
            "byNutrient": by_nutrient,
            "percentErrorFilter": {
                "minGroundTruth": PERCENT_MIN_GROUND_TRUTH,
            },
            "latestGuesses": latest,
        },
    )


def lambda_handler(event, _context):
    if _http_method(event) == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": _DEFAULT_HEADERS,
            "body": "",
        }

    if metadata_table is None or guestimate_table is None:
        logger.error("Missing required DynamoDB table configuration.")
        return _response(500, {"message": "Server is not configured for Guestimate."})

    if AUTH_TOKEN:
        provided_token = _extract_auth_token(event)
        if provided_token != AUTH_TOKEN:
            logger.warning("Unauthorized guestimate request.")
            return _response(401, {"message": "Unauthorized"})

    method = _http_method(event)
    path = _path(event).rstrip("/")

    if method == "GET" and path.endswith("/guestimate/sample"):
        return _handle_get_sample(event)
    if method == "POST" and path.endswith("/guestimate/guess"):
        return _handle_post_guess(event)
    if method == "GET" and path.endswith("/guestimate/analysis"):
        return _handle_get_analysis()

    return _response(404, {"message": "Guestimate endpoint not found."})
