output "static_ip" {
  value = aws_lightsail_static_ip.app.ip_address
}

output "ssh_command" {
  value = "ssh -i ~/.ssh/fantasy-epl ubuntu@${aws_lightsail_static_ip.app.ip_address}"
}