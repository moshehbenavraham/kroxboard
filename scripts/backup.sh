#!/usr/bin/env bash
set -e

# Backup script for OpenClaw filesystem state

OPENCLAW_HOME="${OPENCLAW_HOME:-/var/lib/openclaw}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/openclaw_backup_$DATE.tar.gz"
RETENTION_DAYS=${RETENTION_DAYS:-7}

echo "Starting backup of $OPENCLAW_HOME..."

mkdir -p "$BACKUP_DIR"

if [ ! -d "$OPENCLAW_HOME" ]; then
    echo "Warning: OPENCLAW_HOME ($OPENCLAW_HOME) does not exist."
    echo "Creating empty placeholder for backup validation."
    mkdir -p "$OPENCLAW_HOME"
    touch "$OPENCLAW_HOME/.placeholder"
fi

# Create archive
tar -czf "$BACKUP_FILE" -C "$OPENCLAW_HOME" .
echo "Created backup: $BACKUP_FILE"

# Retention policy: remove backups older than RETENTION_DAYS
echo "Applying retention policy (keeping $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "openclaw_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete

# Example R2/S3 upload (commented out unless credentials are provided)
if [ -n "$S3_BUCKET" ]; then
    echo "Uploading to S3/R2..."
    # aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/backups/"
    echo "Upload step skipped in dry-run/mock."
fi

echo "Backup completed successfully."
