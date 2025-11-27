terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # When you're ready, switch this to an S3 backend.
  # backend "s3" {
  #   bucket = "your-tf-state-bucket"
  #   key    = "menumatch-labeler/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region
}

# ---------- Naming helpers ----------

locals {
  name_prefix         = "${var.project}-${var.env}"
  uploads_bucket_name = "${local.name_prefix}-uploads"
  metadata_table_name = "${local.name_prefix}-metadata"
}

# ---------- Storage: S3 + DynamoDB ----------

resource "aws_s3_bucket" "uploads" {
  bucket = local.uploads_bucket_name

  tags = {
    Project = var.project
    Env     = var.env
  }
}

# Reasonable defaults for a private uploads bucket
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}

resource "aws_dynamodb_table" "metadata" {
  name         = local.metadata_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "objectKey"

  attribute {
    name = "objectKey"
    type = "S"
  }

  tags = {
    Project = var.project
    Env     = var.env
  }
}

# ---------- IAM for Lambdas ----------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${local.name_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Project = var.project
    Env     = var.env
  }
}

# Basic logging
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Extra permissions for DynamoDB + S3
data "aws_iam_policy_document" "lambda_extra" {
  statement {
    sid    = "DynamoMetadataAccess"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Scan",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
      "dynamodb:DescribeTable",
    ]

    resources = [
      aws_dynamodb_table.metadata.arn,
    ]
  }

  statement {
    sid    = "S3UploadAccess"
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:AbortMultipartUpload",
    ]

    resources = [
      "${aws_s3_bucket.uploads.arn}/*",
    ]
  }
}

resource "aws_iam_policy" "lambda_extra" {
  name   = "${local.name_prefix}-lambda-extra"
  policy = data.aws_iam_policy_document.lambda_extra.json
}

resource "aws_iam_role_policy_attachment" "lambda_extra_attach" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_extra.arn
}

# Build Lambda zip archives from source directories

data "archive_file" "get_dataset" {
  type        = "zip"
  source_dir  = "${path.module}/../aws/lambdas/get_dataset"
  output_path = "${path.module}/dist/get_dataset.zip"
}

data "archive_file" "presign_upload" {
  type        = "zip"
  source_dir  = "${path.module}/../aws/lambdas/presign_upload"
  output_path = "${path.module}/dist/presign_upload.zip"
}

data "archive_file" "upload_metadata" {
  type        = "zip"
  source_dir  = "${path.module}/../aws/lambdas/upload_metadata"
  output_path = "${path.module}/dist/upload_metadata.zip"
}

# ---------- Lambda functions ----------

resource "aws_lambda_function" "get_dataset" {
  function_name = "${local.name_prefix}-get-dataset"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.11"
  handler       = "get_dataset.lambda_handler"

  filename         = data.archive_file.get_dataset.output_path
  source_code_hash = data.archive_file.get_dataset.output_base64sha256
  
  environment {
    variables = {
      METADATA_TABLE = aws_dynamodb_table.metadata.name
      AUTH_TOKEN     = var.auth_token
    }
  }

  tags = {
    Project = var.project
    Env     = var.env
  }
}

resource "aws_lambda_function" "presign_upload" {
  function_name = "${local.name_prefix}-presign-upload"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.11"
  handler       = "presign_upload.lambda_handler"

  filename         = data.archive_file.presign_upload.output_path
  source_code_hash = data.archive_file.presign_upload.output_base64sha256

  environment {
    variables = {
      UPLOAD_BUCKET          = aws_s3_bucket.uploads.bucket
      UPLOAD_PREFIX          = var.upload_prefix
      URL_EXPIRATION_SECONDS = tostring(var.url_expiration_seconds)
      AUTH_TOKEN             = var.auth_token
    }
  }

  tags = {
    Project = var.project
    Env     = var.env
  }
}

resource "aws_lambda_function" "upload_metadata" {
  function_name = "${local.name_prefix}-upload-metadata"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.11"
  handler       = "upload_metadata.lambda_handler"

  filename         = data.archive_file.upload_metadata.output_path
  source_code_hash = data.archive_file.upload_metadata.output_base64sha256

  environment {
    variables = {
      METADATA_TABLE = aws_dynamodb_table.metadata.name
      AUTH_TOKEN     = var.auth_token
    }
  }

  tags = {
    Project = var.project
    Env     = var.env
  }
}

# ---------- HTTP API (API Gateway v2) ----------

resource "aws_apigatewayv2_api" "this" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["content-type", "x-api-key", "authorization"]
    allow_methods = ["OPTIONS", "GET", "POST"]
    allow_origins = ["*"]
  }
}

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = var.env
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 3
    throttling_rate_limit  = 5
  }

  tags = {
    Project = var.project
    Env     = var.env
  }
}

# Integrations
resource "aws_apigatewayv2_integration" "get_dataset" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_dataset.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "presign_upload" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.presign_upload.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "upload_metadata" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.upload_metadata.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# Routes: match what your frontend expects
resource "aws_apigatewayv2_route" "get_dataset" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /dataset"
  target    = "integrations/${aws_apigatewayv2_integration.get_dataset.id}"
}

resource "aws_apigatewayv2_route" "presign_upload" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /uploads/presign"
  target    = "integrations/${aws_apigatewayv2_integration.presign_upload.id}"
}

resource "aws_apigatewayv2_route" "upload_metadata" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "POST /uploads/metadata"
  target    = "integrations/${aws_apigatewayv2_integration.upload_metadata.id}"
}

# Allow API Gateway to invoke the Lambdas
resource "aws_lambda_permission" "get_dataset" {
  statement_id  = "AllowAPIGatewayInvokeGetDataset"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_dataset.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_lambda_permission" "presign_upload" {
  statement_id  = "AllowAPIGatewayInvokePresignUpload"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presign_upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_lambda_permission" "upload_metadata" {
  statement_id  = "AllowAPIGatewayInvokeUploadMetadata"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_metadata.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
