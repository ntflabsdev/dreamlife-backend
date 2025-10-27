import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { ChatService } from '../chat/chatService';

interface ChatMessage {
  id: string;
  message: string;
  timestamp: Date;
  type: 'user' | 'bot';
  // Optional metadata for bot answers
  mode?: 'reused' | 'adapted' | 'generated' | 'blocked';
  source?: 'database' | 'openai';
  similarity?: number;
}

interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  lastActivity: Date;
}

export class WebSocketChatService {
  private io: Server;
  private chatService: ChatService;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    
    this.chatService = new ChatService();
    this.setupSocketHandlers();
        setInterval(() => this.cleanupInactiveSessions(), 30 * 60 * 1000);
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      socket.emit('bot_message', {
        id: this.generateMessageId(),
        message: "Hello! Welcome to LAvision. I'm your AI assistant here to help you with questions about dream interpretation, wellness, and our platform. How can I assist you today?",
        timestamp: new Date(),
        type: 'bot'
      });

      socket.on('user_message', async (data: { message: string }) => {
        try {
          const userMessage: ChatMessage = {
            id: this.generateMessageId(),
            message: data.message,
            timestamp: new Date(),
            type: 'user'
          };

          this.addMessageToSession(socket.id, userMessage);

          socket.emit('bot_typing', true);

          const result = await this.chatService.handleQuestion(data.message);

          socket.emit('bot_typing', false);

          const botMessage: ChatMessage = {
            id: this.generateMessageId(),
            message: result.answer,
            timestamp: new Date(),
            type: 'bot',
            mode: result.mode,
            source: result.source,
            similarity: result.similarity
          };

          this.addMessageToSession(socket.id, botMessage);

          socket.emit('bot_message', botMessage);

        } catch (error) {
          console.error('Error processing user message:', error);
          socket.emit('bot_typing', false);
          socket.emit('bot_message', {
            id: this.generateMessageId(),
            message: "I'm sorry, I'm having trouble processing your request right now. Please try again!",
            timestamp: new Date(),
            type: 'bot'
          });
        }
      });

      socket.on('get_chat_history', () => {
        const session = this.sessions.get(socket.id);
        if (session) {
          socket.emit('chat_history', session.messages);
        }
      });

      socket.on('user_typing', (isTyping: boolean) => {
        console.log(`User ${socket.id} is ${isTyping ? 'typing' : 'stopped typing'}`);
      });

      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const session = this.sessions.get(socket.id);
        if (session) {
          session.lastActivity = new Date();
        }
      });

      // Handle clear chat
      socket.on('clear_chat', () => {
        this.sessions.delete(socket.id);
        socket.emit('chat_cleared');
        
        // Send welcome message again
        socket.emit('bot_message', {
          id: this.generateMessageId(),
          message: "Chat cleared! Hello again! I'm here to help you with any questions about LAvision. What would you like to know?",
          timestamp: new Date(),
          type: 'bot'
        });
      });
    });
  }

  private addMessageToSession(socketId: string, message: ChatMessage): void {
    let session = this.sessions.get(socketId);
    
    if (!session) {
      session = {
        sessionId: socketId,
        messages: [],
        lastActivity: new Date()
      };
      this.sessions.set(socketId, session);
    }

    session.messages.push(message);
    session.lastActivity = new Date();

    // Limit session history to last 50 messages to prevent memory issues
    if (session.messages.length > 50) {
      session.messages = session.messages.slice(-50);
    }
  }

  private generateMessageId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  private cleanupInactiveSessions(): void {
    const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    
    for (const [socketId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.sessions.delete(socketId);
        console.log(`Cleaned up inactive session: ${socketId}`);
      }
    }
  }

  // Method to broadcast messages to all connected clients (if needed)
  public broadcastMessage(message: string): void {
    this.io.emit('broadcast_message', {
      id: this.generateMessageId(),
      message,
      timestamp: new Date(),
      type: 'system'
    });
  }

  // Get active sessions count
  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  // Get connected clients count
  public getConnectedClientsCount(): number {
    return this.io.engine.clientsCount;
  }
}
