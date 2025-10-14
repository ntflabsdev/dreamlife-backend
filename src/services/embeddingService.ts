import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
export class EmbeddingService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text
      });

      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid embedding response from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) {
      return 0;
    }
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  findSimilarMessages(
    queryEmbedding: number[],
    messageEmbeddings: { content: string; embedding: number[] }[],
    threshold: number = 0.8,
    limit: number = 5
  ): { content: string; similarity: number }[] {
    const similarities = messageEmbeddings
      .map(msg => ({
        content: msg.content,
        similarity: this.cosineSimilarity(queryEmbedding, msg.embedding)
      }))
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarities;
  }
}
