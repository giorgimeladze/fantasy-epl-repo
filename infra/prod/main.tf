resource "random_id" "suffix" {
  byte_length = 2 # 4 hex characters, e.g. "a3f9"
}

locals {
  name = "${var.project}-${random_id.suffix.hex}" # fantasy-epl-a3f9
}

resource "aws_lightsail_key_pair" "deploy" {
  name       = var.project
  public_key = file(pathexpand(var.ssh_public_key_path))
}

resource "aws_lightsail_instance" "app" {
  name              = local.name
  availability_zone = "${var.aws_region}a"
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = aws_lightsail_key_pair.deploy.name
  user_data         = file("${path.module}/cloud-init.sh")

  add_on {
    type          = "AutoSnapshot"
    snapshot_time = "03:00" # UTC, a quiet hour for FPL
    status        = "Enabled"
  }
}

resource "aws_lightsail_static_ip" "app" {
  name = "${local.name}-ip"
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name
  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.app.created_at]
  }
}

resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  port_info {
    protocol          = "tcp"
    from_port         = 22
    to_port           = 22
    cidrs             = ["0.0.0.0/0"]
    ipv6_cidrs        = []
    cidr_list_aliases = []
  }

  port_info {
    protocol          = "tcp"
    from_port         = 80
    to_port           = 80
    cidrs             = ["0.0.0.0/0"]
    ipv6_cidrs        = []
    cidr_list_aliases = []
  }

  port_info {
    protocol          = "tcp"
    from_port         = 443
    to_port           = 443
    cidrs             = ["0.0.0.0/0"]
    ipv6_cidrs        = []
    cidr_list_aliases = []
  }

  lifecycle {
    replace_triggered_by = [aws_lightsail_instance.app.created_at]
  }
}
