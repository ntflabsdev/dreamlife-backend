import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  userId?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  embedding?: number[];
}

export interface VectorSearchResult {
  content: string;
  similarity: number;
  chatId?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  text: string;
}

export interface ChatResponse {
  response: string;
  chatId: string;
  messageId?: string;
}
