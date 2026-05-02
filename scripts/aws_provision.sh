#!/usr/bin/env bash
# =============================================================
# scripts/aws_provision.sh
# Kavya Transports ERP — One-shot AWS infrastructure provisioner
#
# Provisions (ap-south-1 Mumbai):
#   VPC → 2 subnets → Security groups
#   EC2 t3.medium (Ubuntu 22.04)
#   RDS PostgreSQL 15 (db.t3.small)
#   ElastiCache Redis 7 (cache.t3.micro)
#   DocumentDB 6.0 (db.t3.medium) — see NOTE on MongoDB Atlas below
#   S3 bucket (private, versioned)
#   IAM user + policy for S3 app access
#
# Prerequisites:
#   brew install awscli jq    (macOS)
#   aws configure             (set region=ap-south-1)
#   A valid key pair in ap-south-1 — set KEY_PAIR_NAME below
#
# Usage:
#   KEY_PAIR_NAME=my-key bash scripts/aws_provision.sh
#
# NOTE — MongoDB Atlas (recommended over DocumentDB):
#   DocumentDB is expensive (~$150/mo minimum).
#   For dev/staging: use MongoDB Atlas M0 free tier.
#   For production:  Atlas M10 (~$57/mo) or M20.
#   Set SKIP_DOCDB=true to skip DocumentDB provisioning.
#   Set MONGODB_URL in .env to your Atlas connection string.
# =============================================================
set -euo pipefail

# ── Config — edit before running ────────────────────────────────
: "${KEY_PAIR_NAME:?Set KEY_PAIR_NAME (name of existing EC2 key pair in ap-south-1)}"
: "${SKIP_DOCDB:=false}"          # true = skip DocumentDB (use Atlas)
: "${EC2_INSTANCE_TYPE:=t3.medium}"
: "${RDS_INSTANCE_CLASS:=db.t3.small}"
: "${DOCDB_INSTANCE_CLASS:=db.t3.medium}"
: "${ALLOWED_SSH_CIDR:=0.0.0.0/0}"   # Restrict to your IP in production: X.X.X.X/32

AWS_REGION="ap-south-1"
PROJECT="kavya"
ENV_TAG="production"
S3_BUCKET="${PROJECT}-transports-uploads-prod"

# ── Colours ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✅  $*${NC}"; }
log()  { echo -e "${CYAN}[$(date +%T)]${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠️   $*${NC}"; }
die()  { echo -e "${RED}  ❌  $*${NC}"; exit 1; }
sep()  { echo -e "${BOLD}──────────────────────────────────────────────────────${NC}"; }

# Verify AWS CLI
command -v aws  >/dev/null || die "aws CLI not found — install with: brew install awscli"
command -v jq   >/dev/null || die "jq not found — install with: brew install jq"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
log "AWS account: $ACCOUNT_ID  |  Region: $AWS_REGION"

sep
log "STEP 1 — VPC and subnets"
sep

# Create VPC
VPC_ID=$(aws ec2 create-vpc \
    --cidr-block 10.0.0.0/16 \
    --region "$AWS_REGION" \
    --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${PROJECT}-vpc},{Key=Project,Value=$PROJECT}]" \
    --query 'Vpc.VpcId' --output text)
ok "VPC: $VPC_ID"

# Enable DNS hostnames (required for RDS endpoint resolution)
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames --region "$AWS_REGION"
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support    --region "$AWS_REGION"

# Public subnet A (EC2 lives here)
SUBNET_PUB_A=$(aws ec2 create-subnet \
    --vpc-id "$VPC_ID" \
    --cidr-block 10.0.1.0/24 \
    --availability-zone "${AWS_REGION}a" \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-public-a}]" \
    --region "$AWS_REGION" \
    --query 'Subnet.SubnetId' --output text)
ok "Public subnet A: $SUBNET_PUB_A"

# Private subnet A (RDS/Redis/DocumentDB — same AZ as EC2)
SUBNET_PRIV_A=$(aws ec2 create-subnet \
    --vpc-id "$VPC_ID" \
    --cidr-block 10.0.2.0/24 \
    --availability-zone "${AWS_REGION}a" \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-private-a}]" \
    --region "$AWS_REGION" \
    --query 'Subnet.SubnetId' --output text)
ok "Private subnet A: $SUBNET_PRIV_A"

# Private subnet B (RDS multi-AZ requires 2 subnets in different AZs)
SUBNET_PRIV_B=$(aws ec2 create-subnet \
    --vpc-id "$VPC_ID" \
    --cidr-block 10.0.3.0/24 \
    --availability-zone "${AWS_REGION}b" \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-private-b}]" \
    --region "$AWS_REGION" \
    --query 'Subnet.SubnetId' --output text)
ok "Private subnet B: $SUBNET_PRIV_B"

# Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
    --region "$AWS_REGION" \
    --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${PROJECT}-igw}]" \
    --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$AWS_REGION"
ok "Internet Gateway: $IGW_ID"

# Public route table
RTB_ID=$(aws ec2 create-route-table \
    --vpc-id "$VPC_ID" \
    --region "$AWS_REGION" \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${PROJECT}-public-rtb}]" \
    --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route  --route-table-id "$RTB_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" --region "$AWS_REGION" >/dev/null
aws ec2 associate-route-table --route-table-id "$RTB_ID" --subnet-id "$SUBNET_PUB_A" --region "$AWS_REGION" >/dev/null
aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_PUB_A" --map-public-ip-on-launch --region "$AWS_REGION"
ok "Route table + public subnet wired"

sep
log "STEP 2 — Security groups"
sep

# EC2 security group
SG_EC2=$(aws ec2 create-security-group \
    --group-name "${PROJECT}-ec2-sg" \
    --description "Kavya ERP EC2 instance" \
    --vpc-id "$VPC_ID" \
    --region "$AWS_REGION" \
    --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_EC2" --protocol tcp --port 22  --cidr "$ALLOWED_SSH_CIDR"   --region "$AWS_REGION" >/dev/null
aws ec2 authorize-security-group-ingress --group-id "$SG_EC2" --protocol tcp --port 80  --cidr 0.0.0.0/0             --region "$AWS_REGION" >/dev/null
aws ec2 authorize-security-group-ingress --group-id "$SG_EC2" --protocol tcp --port 443 --cidr 0.0.0.0/0             --region "$AWS_REGION" >/dev/null
ok "EC2 security group: $SG_EC2"

# RDS security group (PostgreSQL — accessible only from EC2)
SG_RDS=$(aws ec2 create-security-group \
    --group-name "${PROJECT}-rds-sg" \
    --description "Kavya ERP RDS PostgreSQL" \
    --vpc-id "$VPC_ID" \
    --region "$AWS_REGION" \
    --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_RDS" \
    --protocol tcp --port 5432 --source-group "$SG_EC2" --region "$AWS_REGION" >/dev/null
ok "RDS security group: $SG_RDS"

# Redis security group (accessible only from EC2)
SG_REDIS=$(aws ec2 create-security-group \
    --group-name "${PROJECT}-redis-sg" \
    --description "Kavya ERP ElastiCache Redis" \
    --vpc-id "$VPC_ID" \
    --region "$AWS_REGION" \
    --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_REDIS" \
    --protocol tcp --port 6379 --source-group "$SG_EC2" --region "$AWS_REGION" >/dev/null
ok "Redis security group: $SG_REDIS"

# DocumentDB security group
SG_DOCDB=$(aws ec2 create-security-group \
    --group-name "${PROJECT}-docdb-sg" \
    --description "Kavya ERP DocumentDB" \
    --vpc-id "$VPC_ID" \
    --region "$AWS_REGION" \
    --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_DOCDB" \
    --protocol tcp --port 27017 --source-group "$SG_EC2" --region "$AWS_REGION" >/dev/null
ok "DocumentDB security group: $SG_DOCDB"

sep
log "STEP 3 — EC2 instance (Ubuntu 22.04 LTS)"
sep

# Latest Ubuntu 22.04 LTS AMI for ap-south-1
AMI_ID=$(aws ec2 describe-images \
    --owners 099720109477 \
    --filters \
        "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
        "Name=state,Values=available" \
    --region "$AWS_REGION" \
    --query 'reverse(sort_by(Images, &CreationDate))[0].ImageId' \
    --output text)
log "Using AMI: $AMI_ID"

# Elastic IP first
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --region "$AWS_REGION" \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${PROJECT}-eip}]" \
    --query 'AllocationId' --output text)
ok "Elastic IP allocated: $EIP_ALLOC"

# Launch EC2
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$EC2_INSTANCE_TYPE" \
    --key-name "$KEY_PAIR_NAME" \
    --subnet-id "$SUBNET_PUB_A" \
    --security-group-ids "$SG_EC2" \
    --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
    --tag-specifications \
        "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-erp-server},{Key=Project,Value=$PROJECT},{Key=Environment,Value=$ENV_TAG}]" \
    --region "$AWS_REGION" \
    --query 'Instances[0].InstanceId' --output text)
ok "EC2 launched: $INSTANCE_ID"

log "Waiting for EC2 to be running ..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$AWS_REGION"

# Associate Elastic IP
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOC" --region "$AWS_REGION" >/dev/null
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --region "$AWS_REGION" \
    --query 'Addresses[0].PublicIp' --output text)
ok "Elastic IP associated: $PUBLIC_IP"

sep
log "STEP 4 — RDS PostgreSQL 15"
sep

# RDS subnet group
aws rds create-db-subnet-group \
    --db-subnet-group-name "${PROJECT}-rds-subnet-group" \
    --db-subnet-group-description "Kavya ERP RDS" \
    --subnet-ids "$SUBNET_PRIV_A" "$SUBNET_PRIV_B" \
    --region "$AWS_REGION" \
    --tags Key=Project,Value="$PROJECT" >/dev/null
ok "RDS subnet group created"

DB_MASTER_PASSWORD=$(python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(24)))")
log "Generated RDS master password — SAVE THIS:"
echo -e "${YELLOW}  DB_MASTER_PASSWORD=${DB_MASTER_PASSWORD}${NC}"

RDS_ID="${PROJECT}-postgres-prod"
aws rds create-db-instance \
    --db-instance-identifier "$RDS_ID" \
    --db-instance-class "$RDS_INSTANCE_CLASS" \
    --engine postgres \
    --engine-version "15.4" \
    --master-username "kavya_admin" \
    --master-user-password "$DB_MASTER_PASSWORD" \
    --db-name "kavya_transports" \
    --allocated-storage 20 \
    --max-allocated-storage 100 \
    --storage-type gp3 \
    --storage-encrypted \
    --vpc-security-group-ids "$SG_RDS" \
    --db-subnet-group-name "${PROJECT}-rds-subnet-group" \
    --backup-retention-period 7 \
    --preferred-backup-window "02:00-03:00" \
    --preferred-maintenance-window "Mon:04:00-Mon:05:00" \
    --no-publicly-accessible \
    --deletion-protection \
    --no-multi-az \
    --region "$AWS_REGION" \
    --tags Key=Project,Value="$PROJECT" >/dev/null
ok "RDS instance creating: $RDS_ID (takes ~5 min)"

sep
log "STEP 5 — ElastiCache Redis 7"
sep

# Redis subnet group
aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name "${PROJECT}-redis-subnet-group" \
    --cache-subnet-group-description "Kavya ERP Redis" \
    --subnet-ids "$SUBNET_PRIV_A" "$SUBNET_PRIV_B" \
    --region "$AWS_REGION" >/dev/null
ok "Redis subnet group created"

REDIS_AUTH_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
log "Generated Redis auth token — SAVE THIS:"
echo -e "${YELLOW}  REDIS_AUTH_TOKEN=${REDIS_AUTH_TOKEN}${NC}"

aws elasticache create-replication-group \
    --replication-group-id "${PROJECT}-redis-prod" \
    --replication-group-description "Kavya ERP Redis" \
    --num-cache-clusters 1 \
    --cache-node-type "cache.t3.micro" \
    --engine redis \
    --engine-version "7.0" \
    --cache-parameter-group-name "default.redis7" \
    --cache-subnet-group-name "${PROJECT}-redis-subnet-group" \
    --security-group-ids "$SG_REDIS" \
    --auth-token "$REDIS_AUTH_TOKEN" \
    --transit-encryption-enabled \
    --at-rest-encryption-enabled \
    --automatic-failover-enabled \
    --no-snapshot-retention-limit \
    --region "$AWS_REGION" \
    --tags Key=Project,Value="$PROJECT" >/dev/null 2>&1 || \
aws elasticache create-replication-group \
    --replication-group-id "${PROJECT}-redis-prod" \
    --replication-group-description "Kavya ERP Redis" \
    --num-cache-clusters 1 \
    --cache-node-type "cache.t3.micro" \
    --engine redis \
    --engine-version "7.0" \
    --cache-parameter-group-name "default.redis7" \
    --cache-subnet-group-name "${PROJECT}-redis-subnet-group" \
    --security-group-ids "$SG_REDIS" \
    --auth-token "$REDIS_AUTH_TOKEN" \
    --transit-encryption-enabled \
    --at-rest-encryption-enabled \
    --region "$AWS_REGION" \
    --tags Key=Project,Value="$PROJECT" >/dev/null
ok "Redis replication group creating: ${PROJECT}-redis-prod (takes ~5 min)"

sep
if [ "$SKIP_DOCDB" = "true" ]; then
    warn "Skipping DocumentDB — use MongoDB Atlas (set MONGODB_URL in .env)"
    DOCDB_ENDPOINT="<Atlas connection string>"
else
    log "STEP 6 — DocumentDB (MongoDB-compatible)"
    sep

    # DocDB subnet group
    aws docdb create-db-subnet-group \
        --db-subnet-group-name "${PROJECT}-docdb-subnet-group" \
        --db-subnet-group-description "Kavya ERP DocumentDB" \
        --subnet-ids "$SUBNET_PRIV_A" "$SUBNET_PRIV_B" \
        --region "$AWS_REGION" \
        --tags Key=Project,Value="$PROJECT" >/dev/null

    DOCDB_PASSWORD=$(python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(24)))")
    log "Generated DocumentDB password — SAVE THIS:"
    echo -e "${YELLOW}  DOCDB_PASSWORD=${DOCDB_PASSWORD}${NC}"

    aws docdb create-db-cluster \
        --db-cluster-identifier "${PROJECT}-docdb-prod" \
        --engine docdb \
        --engine-version "6.0" \
        --master-username "kavya_admin" \
        --master-user-password "$DOCDB_PASSWORD" \
        --vpc-security-group-ids "$SG_DOCDB" \
        --db-subnet-group-name "${PROJECT}-docdb-subnet-group" \
        --storage-encrypted \
        --backup-retention-period 7 \
        --region "$AWS_REGION" \
        --tags Key=Project,Value="$PROJECT" >/dev/null

    aws docdb create-db-instance \
        --db-instance-identifier "${PROJECT}-docdb-prod-1" \
        --db-cluster-identifier "${PROJECT}-docdb-prod" \
        --db-instance-class "$DOCDB_INSTANCE_CLASS" \
        --engine docdb \
        --region "$AWS_REGION" \
        --tags Key=Project,Value="$PROJECT" >/dev/null

    ok "DocumentDB cluster creating: ${PROJECT}-docdb-prod (takes ~5 min)"
fi

sep
log "STEP 7 — S3 bucket"
sep

# S3 bucket names must be globally unique
ACTUAL_BUCKET="${S3_BUCKET}-${ACCOUNT_ID}"
aws s3api create-bucket \
    --bucket "$ACTUAL_BUCKET" \
    --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null

# Block all public access
aws s3api put-public-access-block --bucket "$ACTUAL_BUCKET" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" >/dev/null

# Enable versioning
aws s3api put-bucket-versioning --bucket "$ACTUAL_BUCKET" \
    --versioning-configuration Status=Enabled >/dev/null

# Enable server-side encryption (AES-256)
aws s3api put-bucket-encryption --bucket "$ACTUAL_BUCKET" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}' >/dev/null

ok "S3 bucket: s3://$ACTUAL_BUCKET"

sep
log "STEP 8 — IAM user (kavya-app) for S3 access"
sep

# Create IAM user
aws iam create-user --user-name "kavya-app-prod" \
    --tags Key=Project,Value="$PROJECT" >/dev/null 2>&1 || warn "IAM user kavya-app-prod already exists"

# Create inline policy using existing aws_iam_policy.json template
POLICY_DOC=$(cat "$(dirname "$0")/aws_iam_policy.json" | \
    python3 -c "
import sys,json
d=json.load(sys.stdin)
for stmt in d['Statement']:
    stmt['Resource']=[r.replace('YOUR_BUCKET_NAME','$ACTUAL_BUCKET') for r in stmt.get('Resource',[])]
    if isinstance(stmt.get('Condition',{}).get('StringLike',{}).get('s3:prefix',[]),list):
        pass
print(json.dumps(d))
" 2>/dev/null || cat "$(dirname "$0")/aws_iam_policy.json" | \
    sed "s/YOUR_BUCKET_NAME/$ACTUAL_BUCKET/g")

aws iam put-user-policy \
    --user-name "kavya-app-prod" \
    --policy-name "KavyaS3AppAccess" \
    --policy-document "$POLICY_DOC" >/dev/null

# Generate access keys
KEYS=$(aws iam create-access-key --user-name "kavya-app-prod" --output json)
ACCESS_KEY=$(echo "$KEYS" | jq -r '.AccessKey.AccessKeyId')
SECRET_KEY=$(echo "$KEYS" | jq -r '.AccessKey.SecretAccessKey')
ok "IAM user created: kavya-app-prod"

# ── Wait for RDS ────────────────────────────────────────────────
sep
log "Waiting for RDS to become available (can take 5-10 min) ..."
aws rds wait db-instance-available --db-instance-identifier "$RDS_ID" --region "$AWS_REGION"
RDS_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_ID" \
    --region "$AWS_REGION" \
    --query 'DBInstances[0].Endpoint.Address' --output text)
ok "RDS endpoint: $RDS_ENDPOINT"

# ── Wait for Redis ──────────────────────────────────────────────
log "Waiting for Redis to become available ..."
aws elasticache wait replication-group-available \
    --replication-group-id "${PROJECT}-redis-prod" \
    --region "$AWS_REGION" 2>/dev/null || sleep 30
REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
    --replication-group-id "${PROJECT}-redis-prod" \
    --region "$AWS_REGION" \
    --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' --output text 2>/dev/null || echo "pending")
ok "Redis endpoint: $REDIS_ENDPOINT"

# ── Final summary ───────────────────────────────────────────────
sep
echo -e "${BOLD}${GREEN}"
echo "  ════════════════════════════════════════════"
echo "   AWS PROVISIONING COMPLETE"
echo "  ════════════════════════════════════════════"
echo -e "${NC}"
echo -e "${BOLD}── Infrastructure ──────────────────────────────────${NC}"
echo "  EC2 instance:    $INSTANCE_ID"
echo "  EC2 public IP:   $PUBLIC_IP"
echo "  RDS endpoint:    $RDS_ENDPOINT"
echo "  Redis endpoint:  $REDIS_ENDPOINT"
echo "  S3 bucket:       $ACTUAL_BUCKET"
echo ""
echo -e "${BOLD}── .env values to copy to your server ─────────────${NC}"
cat <<ENV
# ── Paste these into /var/www/kavya/backend/.env ──
ENVIRONMENT=production
DEBUG=false

POSTGRES_HOST=${RDS_ENDPOINT}
POSTGRES_PORT=5432
POSTGRES_USER=kavya_app
POSTGRES_PASSWORD=<run init_production_db.sh — it creates kavya_app user>
POSTGRES_DB=kavya_transports

MONGODB_URL=mongodb://kavya_admin:${DOCDB_PASSWORD:-<Atlas-URI>}@${DOCDB_ENDPOINT:-<Atlas-endpoint>}:27017/?tls=true&tlsCAFile=/var/www/kavya/backend/global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false
MONGODB_DB=kavya_erp_logs

REDIS_HOST=${REDIS_ENDPOINT}
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_AUTH_TOKEN}
REDIS_URL=rediss://:${REDIS_AUTH_TOKEN}@${REDIS_ENDPOINT}:6379/0

STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=${ACCESS_KEY}
AWS_SECRET_ACCESS_KEY=${SECRET_KEY}
AWS_S3_BUCKET=${ACTUAL_BUCKET}
AWS_REGION=${AWS_REGION}

CORS_ORIGINS=["https://erp.kavyatransports.com","https://kavyatransports.com"]
ENV

echo ""
echo -e "${BOLD}── Next steps ──────────────────────────────────────${NC}"
echo "  1. SSH into server:"
echo "       ssh -i ~/.ssh/${KEY_PAIR_NAME}.pem ubuntu@${PUBLIC_IP}"
echo ""
echo "  2. Run server setup:"
echo "       scp scripts/server_setup.sh ubuntu@${PUBLIC_IP}:~/"
echo "       ssh ubuntu@${PUBLIC_IP} 'bash ~/server_setup.sh'"
echo ""
echo "  3. Point your domain DNS A record → $PUBLIC_IP"
echo "       erp.kavyatransports.com  → $PUBLIC_IP"
echo "       kavyatransports.com      → $PUBLIC_IP"
echo ""
echo "  4. Run deploy script:"
echo "       bash scripts/deploy.sh $PUBLIC_IP"
echo ""
echo -e "${YELLOW}  ⚠️  Save the generated passwords above — they are not stored anywhere!${NC}"
sep
