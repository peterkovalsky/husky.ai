import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { AnthropicService } from './services/AnthropicService';

const app = express();
const port = process.env.PORT || 3000;
const aiService = new AnthropicService();

app.use(express.json());

// Increase timeout for all requests to 5 minutes
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ message: 'Hello World!' });
});

app.post('/prompt', async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required and must be a string' });
  }
  
  try {
    console.log('Processing prompt:', prompt.substring(0, 100) + '...');
    const aiResponse = await aiService.generateResponse(prompt);
    console.log('Response generated successfully');
    
    res.json({
      message: 'Prompt processed successfully',
      prompt: prompt,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing prompt:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    res.status(500).json({
      error: 'Failed to process prompt',
      details: errorMessage
    });
  }
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Set server timeout to 5 minutes and keepalive
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 300000; // 5 minutes
server.headersTimeout = 310000; // slightly longer than keepAliveTimeout