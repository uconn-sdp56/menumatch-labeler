# MenuMatch Labeler

MenuMatch Labeler is a lightweight React app for uploading dining hall plate photos, labeling menu items, and reviewing the collected dataset. The backend is serverless AWS infrastructure: API Gateway routes requests to Lambda functions, DynamoDB stores labeling metadata, and S3 stores uploaded images. A shared team API token protects the API routes.

{add system design diagram here}

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

By default the frontend points at the dev API in `frontend/src/lib/config.js`. To run against another API deployment, set `VITE_UPLOAD_API_BASE_URL` before starting Vite.

## Deploy

Deploy the backend with Terraform:

```bash
cd infra
terraform init
terraform plan -var-file="dev.tfvars"
terraform apply -var-file="dev.tfvars"
```

`dev.tfvars` should include at least `env` and `auth_token`; see `infra/example.tfvars` for the minimal shape. After Terraform finishes, use the `api_base_url` output as `VITE_UPLOAD_API_BASE_URL` for the frontend build if it differs from the checked-in default.

Deploy the frontend by pushing changes under `frontend/` to `main`, or by manually running the `Deploy Frontend to GitHub Pages` workflow. The workflow installs dependencies, runs `npm run build`, and publishes `frontend/dist` to GitHub Pages.
