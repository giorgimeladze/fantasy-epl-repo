variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-north-1"
}

variable "project" {
  description = "Project Name"
  type        = string
  default     = "fantasy-epl"
}

variable "environment" {
  description = "Environment"
  type        = string
  default     = "prod"
}

variable "bundle_id" {
  description = "Bundle ID of Lightsail Instance"
  type        = string
  default     = "nano_3_0"
}

variable "blueprint_id" {
  description = "Lightsail OS image: plain Ubuntu, no app bundle"
  type        = string
  default     = "ubuntu_24_04"
}

variable "ssh_public_key_path" {
  description = "Public key installed on the server for SSH (and later the GitHub deploy key)"
  type        = string
  default     = "~/.ssh/fantasy-epl.pub"
}
