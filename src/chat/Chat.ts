import { Schema, model, Document } from 'mongoose';

export interface IMessage {
  content: string;
  timestamp: Date;
  embedding?: number[];
}

export interface IChat extends Document {
  userId: Schema.Types.ObjectId | string;
  title: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  embedding: [{
    type: Number
  }]
});

const chatSchema = new Schema<IChat>({
  userId: {
    type: Schema.Types.Mixed, // Allow both ObjectId and string
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  messages: [messageSchema]
}, {
  timestamps: true
});

chatSchema.index({ userId: 1 });
chatSchema.index({ 'messages.embedding': 1 });

export const Chat = model<IChat>('Chat', chatSchema);
