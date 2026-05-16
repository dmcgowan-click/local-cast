#!/usr/bin/env bash
set -euo pipefail

PULUMI_DIR="$1"
AWS_REGION="$2"

# Install bcryptjs into a temp directory for password hashing
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
npm install --prefix "$TMPDIR" bcryptjs > /dev/null 2>&1

# Resolve the secret ARN from Pulumi stack outputs
SECRET_ARN=$(cd "$PULUMI_DIR" && pulumi stack output credentialsSecretArn)
if [[ -z "$SECRET_ARN" ]]; then
  echo "Error: Could not read credentialsSecretArn from Pulumi stack outputs."
  echo "Make sure infrastructure is deployed first (make up-infra)."
  exit 1
fi

echo "=== Local Cast — Set Credentials ==="
echo ""

# Username
read -rp "Username: " USERNAME
if [[ -z "$USERNAME" ]]; then
  echo "Error: Username cannot be empty."
  exit 1
fi

# Password (hidden input)
read -rsp "Password: " PASSWORD
echo ""
if [[ -z "$PASSWORD" ]]; then
  echo "Error: Password cannot be empty."
  exit 1
fi
read -rsp "Confirm password: " PASSWORD_CONFIRM
echo ""
if [[ "$PASSWORD" != "$PASSWORD_CONFIRM" ]]; then
  echo "Error: Passwords do not match."
  exit 1
fi

# JWT Secret
echo ""
echo "JWT Secret is a random signing key used internally to issue and verify"
echo "session tokens. You set it once here — users never need to know or enter it."
echo ""
read -rp "JWT Secret (leave blank to auto-generate): " JWT_SECRET
if [[ -z "$JWT_SECRET" ]]; then
  JWT_SECRET=$(openssl rand -base64 32)
  echo "Auto-generated JWT Secret."
fi

# Hash the password with bcrypt using Node.js
echo ""
echo "Hashing password..."
PASSWORD_HASH=$(NODE_PATH="$TMPDIR/node_modules" node -e "
  const bcrypt = require('bcryptjs');
  bcrypt.hash(process.argv[1], 10).then(h => process.stdout.write(h));
" "$PASSWORD")

# Build the secret JSON
SECRET_JSON=$(node -e "
  console.log(JSON.stringify({
    username: process.argv[1],
    passwordHash: process.argv[2],
    jwtSecret: process.argv[3]
  }));
" "$USERNAME" "$PASSWORD_HASH" "$JWT_SECRET")

# Update the secret in AWS Secrets Manager
echo "Updating secret in Secrets Manager..."
aws secretsmanager put-secret-value \
  --secret-id "$SECRET_ARN" \
  --secret-string "$SECRET_JSON" \
  --region "$AWS_REGION" \
  > /dev/null

echo ""
echo "Credentials updated successfully."
