#!/usr/bin/env python3
"""
Copy objects from a list of Google Cloud Storage (Firebase Storage) buckets
into a destination bucket within the same project, placing objects under a
folder named after the source bucket. Intended for creating a central legacy
archive bucket (default: 'z-legacy-data').

Requirements:
  pip install -r requirements-gcs.txt
  # or at minimum:
  pip install google-cloud-storage

Authentication:
  - Uses Application Default Credentials (ADC).
  - Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with
    Storage Object Admin permissions on source and destination buckets:
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

Usage example:
  python gcs_copy_to_legacy.py \\
    --project my-firebase-project \\
    --buckets-file ./buckets.txt \\
    --dest-bucket z-legacy-data \\
    --concurrency 16 --skip-existing

The buckets file should contain one bucket name per line. Lines starting with
'#' or blank lines are ignored. Bucket names may be 'gs://bucket-name' or just
'bucket-name'.
"""
import argparse
import concurrent.futures
import os
import sys
from typing import Iterable, List, Optional, Tuple

from google.api_core.exceptions import NotFound, Conflict, Forbidden
from google.cloud import storage


def read_bucket_names(path: str) -> List[str]:
	"""Reads bucket names from a text file, ignoring comments and blanks."""
	buckets: List[str] = []
	with open(path, 'r', encoding='utf-8') as f:
		for raw in f:
			line = raw.strip()
			if not line or line.startswith('#'):
				continue
			if line.startswith('gs://'):
				line = line[len('gs://'):]
			buckets.append(line)
	return buckets


def ensure_bucket(client: storage.Client, project_id: str, bucket_name: str, location: Optional[str], storage_class: Optional[str]) -> storage.Bucket:
	"""
	Returns the destination bucket; creates it if it doesn't exist.
	Note: GCS bucket names are globally unique. If the desired name is
	already taken by another project, creation will fail with Conflict.
	"""
	try:
		return client.get_bucket(bucket_name)
	except NotFound:
		pass

	if location is None:
		# Default to 'US' if not provided
		location = 'US'

	print(f"Destination bucket '{bucket_name}' not found. Creating in project '{project_id}' (location={location}, storage_class={storage_class or 'STANDARD'})...")
	bucket = storage.Bucket(client=client, name=bucket_name)
	bucket.location = location
	if storage_class:
		bucket.storage_class = storage_class
	try:
		return client.create_bucket(bucket, project=project_id)
	except Conflict as e:
		print(f"ERROR: Could not create bucket '{bucket_name}': {e}", file=sys.stderr)
		raise
	except Forbidden as e:
		print(f"ERROR: Permission denied creating bucket '{bucket_name}': {e}", file=sys.stderr)
		raise


def list_source_blobs(client: storage.Client, bucket_name: str) -> Iterable[storage.Blob]:
	"""Lists all blobs in the given source bucket."""
	return client.list_blobs(bucket_name)


def copy_single_blob(source_bucket: storage.Bucket, blob: storage.Blob, dest_bucket: storage.Bucket, dest_prefix: str, skip_existing: bool) -> Tuple[str, bool, Optional[str]]:
	"""
	Copies a single blob to the destination bucket under 'dest_prefix + source_bucket.name + / + blob.name'.
	Returns (blob_name, copied_bool, error_message_or_None).
	"""
	dest_blob_name = f"{dest_prefix}{source_bucket.name}/{blob.name}" if dest_prefix else f"{source_bucket.name}/{blob.name}"
	dest_blob = dest_bucket.blob(dest_blob_name)

	if skip_existing:
		try:
			# Fast existence check
			if dest_blob.exists(source_bucket.client):
				# Optional: compare size/crc32c to skip identical files
				if dest_blob.size == blob.size and dest_blob.crc32c == blob.crc32c:
					return (dest_blob_name, False, None)
		except Exception:
			# If exists() fails, fall back to attempting the copy
			pass

	try:
		# Uses server-side copy (rewrite) under the hood when needed
		source_bucket.copy_blob(blob, dest_bucket, new_name=dest_blob_name)
		return (dest_blob_name, True, None)
	except Exception as e:
		return (dest_blob_name, False, str(e))


def copy_bucket(client: storage.Client, source_bucket_name: str, dest_bucket: storage.Bucket, concurrency: int, dest_prefix: str, skip_existing: bool, dry_run: bool) -> Tuple[int, int, int]:
	"""
	Copies all blobs from a source bucket to the destination bucket under 'dest_prefix + source_bucket_name/'.
	Returns (copied_count, skipped_count, error_count).
	"""
	try:
		source_bucket = client.get_bucket(source_bucket_name)
	except NotFound:
		print(f"WARNING: Source bucket not found: {source_bucket_name}", file=sys.stderr)
		return (0, 0, 1)
	except Forbidden as e:
		print(f"WARNING: Access forbidden to source bucket '{source_bucket_name}': {e}", file=sys.stderr)
		return (0, 0, 1)

	blobs = list(list_source_blobs(client, source_bucket_name))
	total = len(blobs)
	print(f"Bucket '{source_bucket_name}': {total} object(s) to evaluate.")
	if total == 0:
		return (0, 0, 0)

	if dry_run:
		# Only report planned operations
		skipped = 0
		planned = 0
		for blob in blobs:
			dest_blob_name = f"{dest_prefix}{source_bucket.name}/{blob.name}" if dest_prefix else f"{source_bucket.name}/{blob.name}"
			if skip_existing:
				dest_blob = dest_bucket.blob(dest_blob_name)
				try:
					if dest_blob.exists(client) and dest_blob.size == blob.size and dest_blob.crc32c == blob.crc32c:
						skipped += 1
						continue
				except Exception:
					pass
			planned += 1
		print(f"Bucket '{source_bucket_name}': planned copies: {planned}, skipped(existing+identical): {skipped}")
		return (0, skipped, 0)

	copied = 0
	skipped = 0
	errors = 0

	def task(b: storage.Blob) -> Tuple[str, bool, Optional[str]]:
		return copy_single_blob(source_bucket, b, dest_bucket, dest_prefix, skip_existing)

	with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
		for idx, result in enumerate(pool.map(task, blobs), start=1):
			name, did_copy, err = result
			if err is not None:
				errors += 1
				if errors <= 10:
					print(f"ERROR copying '{name}': {err}", file=sys.stderr)
			else:
				if did_copy:
					copied += 1
				else:
					skipped += 1
			if idx % 100 == 0 or idx == total:
				print(f"  Progress: {idx}/{total} (copied={copied}, skipped={skipped}, errors={errors})")

	return (copied, skipped, errors)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Copy GCS buckets into a legacy archive bucket under per-bucket folders.")
	parser.add_argument("--project", required=True, help="GCP/Firebase project ID (for bucket creation and client).")
	parser.add_argument("--buckets-file", required=True, help="Path to a file containing source bucket names (one per line).")
	parser.add_argument("--dest-bucket", default="z-legacy-data", help="Destination bucket name (default: z-legacy-data).")
	parser.add_argument("--dest-prefix", default="", help="Optional additional prefix under destination bucket (default: '').")
	parser.add_argument("--location", default=None, help="Destination bucket location if creation is needed (e.g., US, EU).")
	parser.add_argument("--storage-class", default=None, help="Destination bucket storage class if creation is needed (e.g., STANDARD, NEARLINE).")
	parser.add_argument("--concurrency", type=int, default=16, help="Max parallel copy operations (default: 16).")
	parser.add_argument("--skip-existing", action="store_true", help="Skip copies when destination object exists with identical size+crc32c.")
	parser.add_argument("--dry-run", action="store_true", help="Do not copy; only report planned operations and counts.")
	return parser.parse_args()


def main() -> None:
	args = parse_args()

	buckets = read_bucket_names(args.buckets_file)
	if not buckets:
		print("No bucket names found in buckets file. Exiting.", file=sys.stderr)
		sys.exit(1)

	client = storage.Client(project=args.project)
	dest_bucket = ensure_bucket(client, args.project, args.dest_bucket, args.location, args.storage_class)

	total_copied = 0
	total_skipped = 0
	total_errors = 0
	for name in buckets:
		copied, skipped, errors = copy_bucket(
			client=client,
			source_bucket_name=name,
			dest_bucket=dest_bucket,
			concurrency=args.concurrency,
			dest_prefix=args.dest_prefix,
			skip_existing=args.skip_existing,
			dry_run=args.dry_run,
		)
		total_copied += copied
		total_skipped += skipped
		total_errors += errors

	print("")
	print(f"All done. copied={total_copied}, skipped={total_skipped}, errors={total_errors}")
	if total_errors > 0:
		sys.exit(2)


if __name__ == "__main__":
	main()


