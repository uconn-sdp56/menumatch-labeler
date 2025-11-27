output "api_base_url" {
  description = "Base URL for the HTTP API stage"
  value       = aws_apigatewayv2_stage.this.invoke_url
}

output "uploads_bucket" {
  description = "S3 bucket for uploads"
  value       = aws_s3_bucket.uploads.bucket
}

output "metadata_table" {
  description = "DynamoDB table for upload metadata"
  value       = aws_dynamodb_table.metadata.name
}