# MenuMatch Labeler — Infra (Terraform)

Infrastructure is managed with Terraform (see `infra/main.tf`).

## Prereqs
- Terraform >= 1.5
- AWS credentials configured for the target account/region
- `dev.tfvars` (or your env tfvars) with values for:
  - `auth_token` (shared API token)
  - `upload_prefix`
  - `url_expiration_seconds`
  - `project`, `env`, `aws_region`

## Deploy
```bash
terraform init
terraform plan -var-file="dev.tfvars"
terraform apply -var-file="dev.tfvars"
```

## Resources (defined in Terraform)
- API Gateway HTTP API with routes:
  - POST `/uploads/presign` → presign_upload
  - POST `/uploads/metadata` → upload_metadata
  - GET `/dataset` → get_dataset
  - GET `/dataset/{objectKey+}` → get_dataset_item
  - POST `/downloads/presign` → presign_download
- Lambdas for the above endpoints
- DynamoDB table `mml-metadata` (hash key: `objectKey`)
- S3 uploads/downloads bucket
- IAM roles/policies for Lambda access to S3/DynamoDB

## Notes
- `{objectKey+}` route preserves keys with slashes.
- Presigned URLs are bearer tokens; keep `url_expiration_seconds` reasonable (e.g., 300–900s) and guard issuance with `auth_token`.
