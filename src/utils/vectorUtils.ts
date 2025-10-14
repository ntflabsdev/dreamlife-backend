export interface VectorSearchResult {
  content: string;
  similarity: number;
  chatId?: string;
}

export interface MessageWithEmbedding {
  content: string;
  embedding: number[];
  chatId?: string;
}

export class VectorUtils {
  static cosineSimilarity(a: number[], b: number[]): number {
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

  static findTopSimilar(
    queryEmbedding: number[],
    messages: MessageWithEmbedding[],
    threshold: number = 0.8,
    limit: number = 5
  ): VectorSearchResult[] {
    return messages
      .map(msg => ({
        content: msg.content,
        similarity: this.cosineSimilarity(queryEmbedding, msg.embedding),
        chatId: msg.chatId
      }))
      .filter(result => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  static normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude === 0 ? vector : vector.map(val => val / magnitude);
  }
}
