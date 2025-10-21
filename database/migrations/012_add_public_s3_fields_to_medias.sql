-- Add public S3 bucket fields to medias table
-- These fields store the public copy of media files that can be referenced directly in generated websites

ALTER TABLE medias ADD COLUMN s3_public_key VARCHAR(500);
ALTER TABLE medias ADD COLUMN s3_public_bucket VARCHAR(200);

-- Add index for efficient lookups by public key
CREATE INDEX idx_medias_s3_public_key ON medias(s3_public_key);

-- Add comments
COMMENT ON COLUMN medias.s3_public_key IS 'S3 object key in the public media bucket (for direct website use)';
COMMENT ON COLUMN medias.s3_public_bucket IS 'Public S3 bucket name where the file is publicly accessible';
