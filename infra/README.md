To deploy

Make a dev.tfvars file, follow example.tfvars

terraform init

terraform plan -var-file="dev.tfvars"

terraform apply -var-file="dev.tfvars"