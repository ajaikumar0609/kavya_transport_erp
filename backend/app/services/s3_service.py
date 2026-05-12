# S3 / File Storage Service
import os
import uuid
import logging
import httpx
from pathlib import Path
from fastapi import HTTPException
from app.core.config import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def _use_local_storage() -> bool:
    """Check if S3 is configured; fall back to local otherwise."""
    return not getattr(settings, "AWS_ACCESS_KEY_ID", None) or not getattr(settings, "AWS_S3_BUCKET", None)


async def upload_file(file_bytes: bytes, filename: str, folder: str = "documents",
                      content_type: str = "application/octet-stream") -> dict:
    ext = os.path.splitext(filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    s3_key = f"{folder}/{unique_name}"

    # Try S3 first, fall back to local storage
    if not _use_local_storage():
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION,
            )
            s3.put_object(
                Bucket=settings.AWS_S3_BUCKET, Key=s3_key, Body=file_bytes,
                ContentType=content_type,
            )
            return {
                "s3_key": s3_key,
                "url": f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}",
                "filename": filename, "size": len(file_bytes),
                "content_type": content_type, "source": "LIVE",
            }
        except Exception as e:
            logger.warning(f"S3 upload failed, falling back to local: {e}")

    # Local storage fallback
    local_dir = UPLOAD_DIR / folder
    local_dir.mkdir(parents=True, exist_ok=True)
    local_path = local_dir / unique_name
    local_path.write_bytes(file_bytes)
    return {
        "s3_key": s3_key,
        "url": f"/uploads/{folder}/{unique_name}",
        "filename": filename, "size": len(file_bytes),
        "content_type": content_type, "source": "LOCAL",
    }


async def get_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET, "Key": s3_key},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"S3 presigned URL failed: {str(e)[:200]}")


async def presign_stored_url(url: str, expires_in: int = 3600) -> str:
    """Convert a stored S3 URL (full URL or key) into a presigned URL.
    Returns '' only when the key is confirmed missing (NoSuchKey/404).
    Falls through and presigns for AccessDenied or other transient errors.
    All blocking boto3 calls are run in a thread to avoid blocking the event loop.
    """
    if not url:
        return url
    if url.startswith('data:'):
        return url
    if url.startswith('/uploads/') or url.startswith('/api/'):
        return url
    # Already presigned — skip to avoid double-presigning
    if 'X-Amz-Algorithm=' in url or 'X-Amz-Credential=' in url:
        return url
    if not _use_local_storage():
        try:
            import asyncio
            import boto3
            from botocore.exceptions import ClientError
            bucket = getattr(settings, 'AWS_S3_BUCKET', '')
            region = getattr(settings, 'AWS_REGION', '')
            full_prefix = 'https://' + bucket + '.s3.' + region + '.amazonaws.com/'
            alt_prefix = 'https://' + bucket + '.s3.amazonaws.com/'
            if url.startswith(full_prefix):
                s3_key = url[len(full_prefix):]
            elif url.startswith(alt_prefix):
                s3_key = url[len(alt_prefix):]
            else:
                s3_key = url
            s3_key = s3_key.split('?')[0]
            s3 = boto3.client('s3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=region)

            def _blocking_presign() -> str:
                # head_object is an HTTP call — must run in a thread
                try:
                    s3.head_object(Bucket=bucket, Key=s3_key)
                except ClientError as head_err:
                    code = head_err.response.get('Error', {}).get('Code', '')
                    if code in ('404', 'NoSuchKey'):
                        logger.warning('presign_stored_url: key not found in S3: %s', s3_key)
                        return ''
                    # AccessDenied or other — fall through and presign anyway
                except Exception as head_err:
                    logger.warning('presign_stored_url: head_object error: %s', str(head_err)[:100])
                return s3.generate_presigned_url('get_object',
                    Params={'Bucket': bucket, 'Key': s3_key}, ExpiresIn=expires_in)

            return await asyncio.to_thread(_blocking_presign)
        except Exception as e:
            logger.warning('presign_stored_url failed: ' + str(e)[:120])
            return url
    return url


async def delete_file(s3_key: str) -> bool:
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        s3.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=s3_key)
        return True
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"S3 delete failed: {str(e)[:200]}")
