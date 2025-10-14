import { Schema, model, Document } from 'mongoose';

export interface IKnowledgeBase extends Document {
  question: string;
  answer: string;
  questionEmbedding: number[];
  answerEmbedding: number[];
  similarity?: number; // for search results
  createdAt: Date;
  updatedAt: Date;
}

const knowledgeBaseSchema = new Schema<IKnowledgeBase>({
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    required: true
  },
  questionEmbedding: [{
    type: Number,
    required: true
  }],
  answerEmbedding: [{
    type: Number,
    required: true
  }]
}, {
  timestamps: true
});

// Index for better search performance
knowledgeBaseSchema.index({ questionEmbedding: 1 });
knowledgeBaseSchema.index({ createdAt: -1 });

export const KnowledgeBase = model<IKnowledgeBase>('KnowledgeBase', knowledgeBaseSchema);
