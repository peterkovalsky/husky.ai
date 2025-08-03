# Husky AI API

This is the backend API for the Husky AI React app generator. It provides asynchronous job processing using AWS SQS and S3 for building and hosting React applications.

## Features

- **Asynchronous Processing**: Jobs are queued in AWS SQS and processed in the background
- **Real-time Status Tracking**: Monitor job progress through different stages
- **AWS S3 Integration**: Built apps are automatically uploaded to S3 for web preview
- **Job Status Management**: In-memory tracking of job states (QUEUED, PROCESSING, BUILDING, READY)
- **Health Monitoring**: Built-in health check endpoint

## API Endpoints

### POST /prompt
Submit a new job for processing.

**Request Body:**
```json
{
  "prompt": "Create a React app with a counter component"
}
```

**Response:**
```json
{
  "message": "Job queued successfully",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "QUEUED",
  "timestamp": "2023-07-18T10:30:00.000Z"
}
```

### GET /status/:jobId
Check the status of a specific job.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "READY",
  "createdAt": "2023-07-18T10:30:00.000Z",
  "updatedAt": "2023-07-18T10:35:00.000Z",
  "previewUrl": "https://bucket-name.s3.amazonaws.com/apps/job-id/index.html",
  "errorMessage": null
}
```

**Job Statuses:**
- `QUEUED`: Job is waiting to be processed
- `PROCESSING`: AI is generating the React app code
- `BUILDING`: App is being built and uploaded to S3
- `READY`: App is ready with preview URL (or error occurred)

### GET /health
Health check endpoint with system status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-07-18T10:30:00.000Z",
  "processor": {
    "isProcessing": true
  },
  "jobs": {
    "total": 5,
    "queued": 1,
    "processing": 1,
    "building": 0,
    "ready": 3
  }
}
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
# Supabase Configuration (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic AI Configuration (Required)
ANTHROPIC_API_KEY=your-anthropic-api-key

# AWS Configuration (Required)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key

# S3 Configuration (Required)
S3_BUCKET_NAME=your-main-bucket-name
S3_VERSIONS_BUCKET_NAME=your-versions-bucket-name

# SQS Configuration (Required)
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/your-queue-name

# Server Configuration
PORT=3333
NODE_ENV=development
```

**⚠️ All environment variables are required for the application to start. The server will fail to start with clear error messages if any are missing.**

## AWS Setup

### 1. Create SQS Queue
```bash
aws sqs create-queue --queue-name husky-jobs --region us-east-1
```

### 2. Create S3 Bucket
```bash
aws s3 mb s3://husky-apps-preview --region us-east-1
```

### 3. Configure S3 Bucket for Web Hosting
```bash
aws s3 website s3://husky-apps-preview --index-document index.html --error-document error.html
```

### 4. Set S3 Bucket Policy for Public Read
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::husky-apps-preview/*"
    }
  ]
}
```

## Installation & Development

```bash
# Install dependencies
npm install

# Development with auto-restart
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

The system consists of several key components:

1. **Express API**: Handles HTTP requests and responses
2. **Job Status Service**: In-memory tracking of job states
3. **SQS Service**: Manages message queuing for async processing
4. **S3 Service**: Handles file uploads and web hosting
5. **Job Processor**: Background worker that processes SQS messages
6. **Anthropic Service**: AI integration for generating React apps

## Job Processing Flow

1. Client submits prompt via `/prompt` endpoint
2. Job is created with unique ID and QUEUED status
3. Message is sent to SQS queue
4. Background processor picks up message
5. Job status updated to PROCESSING
6. AI generates React app code
7. Job status updated to BUILDING
8. App is built and uploaded to S3
9. Job status updated to READY with preview URL
10. Client can poll `/status/:jobId` to check progress

## Error Handling

- Jobs that fail are marked as READY with an error message
- Failed messages are removed from SQS to prevent reprocessing
- Old jobs (>24 hours) are automatically cleaned up
- AWS service initialization errors will prevent server startup

## Production Considerations

- Consider using a persistent database instead of in-memory job storage
- Implement retry logic for failed jobs
- Add authentication and rate limiting
- Monitor SQS queue depth and processing times
- Set up CloudWatch alarms for error rates
- Consider using Lambda for job processing instead of background processes