# MenuMatch Labeler — AWS Services

Serverless backend for the MenuMatch labeling workflow. Lambdas handle uploads, metadata, dataset reads, and download presigns; API Gateway fronts the functions; DynamoDB stores metadata; S3 stores images.

## Lambdas (code in `aws/lambdas`)
- `presign_upload`: POST `/uploads/presign` – generate a PUT presigned URL for image upload to S3.
- `upload_metadata`: POST `/uploads/metadata` – store labeling metadata (mealtime, date, diningHallId, difficulty, items, uploadedBy, etc.) in DynamoDB.
- `get_dataset`: GET `/dataset` – list all recorded items from DynamoDB.
- `get_dataset_item`: GET `/dataset/{objectKey+}` – fetch a single record by S3 object key.
- `presign_download`: POST `/downloads/presign` – generate a GET presigned URL for image download from S3.

All routes are protected with a shared `AUTH_TOKEN` (header `X-Api-Key` or bearer token). CORS is open for the frontend.

## Infra
- API Gateway HTTP API routes to the Lambdas.
- DynamoDB table `mml-metadata` (hash key: `objectKey`).
- S3 bucket for uploads/downloads.
- IAM role/policies for Lambda access to DynamoDB and S3.
- Terraform defines the resources (see `infra/main.tf`). More details in `infra/README.md`.