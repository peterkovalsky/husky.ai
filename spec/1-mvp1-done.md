## Frontend

The main page should have a textarea for entering a prompt and be displayed in the middle center of the screen. User enters prompt and hits Enter to call prompt endpoint. The textarea gracefully moves to the top. Display nice looking loading spinner in the middle of the page. Start poll status endpoint every 10 sec to check is status is ready and it has preview url. Once the preview is ready, grab the url and show it in the iframe on the main screen. The text area is still visible at very top of the page but the iframe takes up all the remaining space.

## API

- Prompt endpoint: receives user’s prompt and submits a aws sqs message witch contains the prompt. Marks the global status to QUEUED.
- Status endpoint: reveals the status of the job. Possible statuses: QUEUED, PROCESSING, BUILDING, READY, COMPLETED, FAILED.

## Agent

### AI stage

1. Receives sqs message from the queue.
2. Marks the global status to PROCESSING
3. Process user media (resize images if needed)
4. Submits prompt to AI service (reuse existing functionality)
5. Parses AI response into JSON (reuse existing functionality)
6. Validates the response, if error try again with error description
7. Update file tree (reuse existing functionality)

### Build stage

1. Marks the global status to BUILDING
2. Save file tree to disk as physical files
3. Run preview build commands to build React app
4. Upload the preview build to S3 bucket for web preview
5. Marks the global status to READY (preview is now live!)
6. Run production build and upload to S3
7. Marks the global status to COMPLETED (all builds finished)