# Husky AI Frontend

The frontend interface for the Husky AI MVP1 application. This React application provides a clean, modern interface for users to submit prompts and view generated applications.

## Features

- **Centered Textarea**: Initial prompt input in the center of the screen
- **Graceful Transitions**: Smooth UI transitions when moving from initial to processing state
- **Loading States**: Beautiful loading spinner with status-specific messaging
- **Status Polling**: Automatic polling of job status every 10 seconds
- **Preview Display**: Iframe preview of generated applications when ready
- **Error Handling**: Comprehensive error handling with user feedback
- **Responsive Design**: Mobile-friendly responsive layout

## Technology Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Modern ES6+** features

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## API Integration

The frontend communicates with the backend API through these endpoints:

- `POST /api/prompt` - Submit a new prompt for processing
- `GET /api/status/:jobId` - Get the current status of a job

The API proxy is configured in `vite.config.ts` to forward `/api/*` requests to `http://localhost:3000`.

## Application States

The application manages several states:

1. **Initial**: Welcome screen with centered textarea
2. **Submitted**: Prompt has been submitted, polling started
3. **Loading**: Job is being processed (QUEUED, PROCESSING, BUILDING)
4. **Ready**: Job is complete and preview is available
5. **Error**: An error occurred during processing

## Job Status Types

- **QUEUED**: Job is waiting to be processed
- **PROCESSING**: AI is analyzing the prompt
- **BUILDING**: Application is being built and deployed
- **READY**: Application is ready for preview

## Usage

1. Enter your application idea in the textarea
2. Press Enter or click submit
3. Wait for the AI to process your request
4. View the generated application in the preview iframe
5. Use "Start Over" to create a new application

## Project Structure

```
src/
├── components/
│   └── LoadingSpinner.tsx    # Loading animation component
├── services/
│   └── api.ts                # API service functions
├── App.tsx                   # Main application component
├── main.tsx                  # Application entry point
└── index.css                 # Global styles
```

## Security Features

- **Iframe Sandboxing**: Preview iframes are sandboxed for security
- **Input Sanitization**: User inputs are properly handled
- **Error Boundaries**: Graceful error handling throughout the application
