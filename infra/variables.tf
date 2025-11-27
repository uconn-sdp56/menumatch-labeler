variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Logical project name"
  type        = string
  default     = "menumatch-labeler"
}

variable "env" {
  description = "Deployment environment (dev/stage/prod)"
  type        = string
}

variable "auth_token" {
  description = "Shared API token for labeler API"
  type        = string
  sensitive   = true
}

variable "upload_prefix" {
  description = "Prefix for uploaded objects"
  type        = string
  default     = "v1/"
}

variable "url_expiration_seconds" {
  description = "Presigned URL expiration"
  type        = number
  default     = 30
}
