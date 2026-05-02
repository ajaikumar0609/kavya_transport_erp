#!/usr/bin/env bash
# =============================================================
# scripts/aws_cloudwatch_alarms.sh
# Creates CloudWatch alarms for Kavya Transports EC2 on ap-south-1
#
# Prerequisites:
#   aws configure  (set region=ap-south-1)
#   CloudWatch agent installed on EC2 for memory/disk metrics
#
# Usage:
#   INSTANCE_ID=i-0abc123 SNS_EMAIL=admin@kavyatransports.com bash aws_cloudwatch_alarms.sh
# =============================================================
set -euo pipefail

: "${INSTANCE_ID:?Set INSTANCE_ID (e.g. i-0abc1234def)}"
: "${SNS_EMAIL:=admin@kavyatransports.com}"
: "${AWS_REGION:=ap-south-1}"
: "${ALARM_PREFIX:=KavyaERP}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()  { echo -e "${GREEN}  ✅  $*${NC}"; }
log() { echo -e "${CYAN}[$(date +%T)]${NC} $*"; }

log "Creating SNS topic for alerts ..."
SNS_ARN=$(aws sns create-topic \
    --name "${ALARM_PREFIX}-Alerts" \
    --region "$AWS_REGION" \
    --query TopicArn --output text)
ok "SNS topic: $SNS_ARN"

log "Subscribing $SNS_EMAIL to alerts ..."
aws sns subscribe \
    --topic-arn "$SNS_ARN" \
    --protocol email \
    --notification-endpoint "$SNS_EMAIL" \
    --region "$AWS_REGION" > /dev/null
ok "Subscription pending email confirmation — check inbox"

# ── CPU > 80% for 5 consecutive minutes ─────────────────────
log "Creating CPU alarm ..."
aws cloudwatch put-metric-alarm \
    --alarm-name "${ALARM_PREFIX}-HighCPU" \
    --alarm-description "CPU > 80% for 5 min on Kavya ERP" \
    --metric-name CPUUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 60 \
    --evaluation-periods 5 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --ok-actions "$SNS_ARN" \
    --treat-missing-data notBreaching \
    --region "$AWS_REGION"
ok "CPU alarm created"

# ── Memory > 85% (requires CloudWatch agent custom metric) ───
log "Creating Memory alarm ..."
aws cloudwatch put-metric-alarm \
    --alarm-name "${ALARM_PREFIX}-HighMemory" \
    --alarm-description "Memory > 85% on Kavya ERP" \
    --metric-name mem_used_percent \
    --namespace CWAgent \
    --statistic Average \
    --period 60 \
    --evaluation-periods 3 \
    --threshold 85 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --treat-missing-data notBreaching \
    --region "$AWS_REGION"
ok "Memory alarm created"

# ── Disk > 80% ───────────────────────────────────────────────
log "Creating Disk alarm ..."
aws cloudwatch put-metric-alarm \
    --alarm-name "${ALARM_PREFIX}-HighDisk" \
    --alarm-description "Disk (/) > 80% on Kavya ERP" \
    --metric-name disk_used_percent \
    --namespace CWAgent \
    --statistic Average \
    --period 300 \
    --evaluation-periods 2 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" Name=path,Value=/ Name=fstype,Value=ext4 \
    --alarm-actions "$SNS_ARN" \
    --treat-missing-data notBreaching \
    --region "$AWS_REGION"
ok "Disk alarm created"

# ── Status check failed ──────────────────────────────────────
log "Creating Status Check alarm ..."
aws cloudwatch put-metric-alarm \
    --alarm-name "${ALARM_PREFIX}-StatusCheckFailed" \
    --alarm-description "EC2 instance health check failed" \
    --metric-name StatusCheckFailed \
    --namespace AWS/EC2 \
    --statistic Maximum \
    --period 60 \
    --evaluation-periods 2 \
    --threshold 1 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
    --alarm-actions "$SNS_ARN" \
    --treat-missing-data notBreaching \
    --region "$AWS_REGION"
ok "Status check alarm created"

log "═══════════════════════════════════════"
ok "All CloudWatch alarms created. Confirm SNS subscription email."
log "═══════════════════════════════════════"

# ── UFW firewall rules (run on EC2, not here) ────────────────
cat <<'UFW'

# ── UFW Rules (run on EC2 as root) ──────────────────────────
# sudo ufw default deny incoming
# sudo ufw default allow outgoing
# sudo ufw allow 22/tcp comment 'SSH — restrict to your IP in production'
# sudo ufw allow 80/tcp comment 'HTTP (for certbot)'
# sudo ufw allow 443/tcp comment 'HTTPS'
# sudo ufw deny 8000/tcp comment 'FastAPI — internal only via Nginx'
# sudo ufw deny 5432/tcp comment 'PostgreSQL — internal only'
# sudo ufw deny 6379/tcp comment 'Redis — internal only'
# sudo ufw deny 27017/tcp comment 'MongoDB — internal only'
# sudo ufw --force enable
# sudo ufw status verbose
UFW
