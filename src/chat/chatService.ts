import { EmbeddingService } from '../services/embeddingService';
import { KnowledgeBase } from '../models/KnowledgeBase';
import { VectorUtils } from '../utils/vectorUtils';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Configuration knobs (easy to adjust without touching logic)
const SIM_THRESHOLDS = {
  reuse: 0.9,        // >= reuse answer directly
  adapt: 0.65        // >= adapt with rephrase
};

// Domain scope (narrow, aligned with dream life design & platform)
const SCOPE_KEYWORDS = [
  'dream','dreams','lucid','blueprint','life blueprint','visualization','visualisation','vision','identity',
  'values','imagination','world','3d','worlds','manifest','manifestation','daily mission','mission','missions',
  'mirror','pricing','price','plan','plans','subscription','legend','visionary','explorer','coach','coaching',
  'avatar','environment','energy','alignment','aligned','questionnaire'
];

// Deterministic pattern responders (simple & extendable)
const DIRECT_PATTERNS: { regex: RegExp; answer: string }[] = [
  {
    regex: /(price|pricing|plan|plans|subscription|legend|visionary|explorer|how much|upgrade|downgrade|trial)/i,
    answer: "Pricing & Plans: Explorer (Free) starts you with a static 3D home scene + partial Life Blueprint. Visionary ($14.99/mo, 14‑day trial) unlocks full interactive 3D world, customization, mirror mode (dream body), one vehicle, future partner avatar. Legend ($34.99/mo, 14‑day trial) adds advanced mirror (body+face+emotions), daily AI Dream Coach, dream life video generation, private Visionaries Community. Upgrades are instant; downgrades next cycle. 50% verified student discount. Ask if you want a recommendation."}
];

export class ChatService {
  private embeddingService: EmbeddingService;
  private openai: OpenAI;
  private embeddingCache: Map<string, number[]> = new Map(); // simple in-memory cache
  // Runtime metrics
  private metrics = {
    totalQueries: 0,
    scopeRejected: 0,
    directPatternHits: 0,
    reuseHits: 0,
    adaptiveHits: 0,
    generativeHits: 0
  };

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async handleQuestion(question: string): Promise<{
    answer: string;
    source: 'database' | 'openai';
    similarity?: number;
  }> {
    try {
  this.metrics.totalQueries++;
      console.log('Processing question:', question);

      // 1. Scope filtering
      if (!this.isInScope(question)) {
  this.metrics.scopeRejected++;
        return { answer: this.buildOutOfScopeResponse(), source: 'openai' };
      }

      // 2. Direct deterministic pattern checks (cheap)
      const direct = this.tryDirectPattern(question);
      if (direct) return { answer: direct, source: 'database' };

      // 3. Embedding (with simple cache)
      const questionEmbedding = await this.getOrCreateEmbedding(question);

      // 4. Retrieve KB candidates
      const candidates = await this.retrieveCandidates(questionEmbedding, 4);

      if (candidates.length) {
        const top = candidates[0];
        if (top) {
          if (top.similarity >= SIM_THRESHOLDS.reuse) {
            this.metrics.reuseHits++;
            return { answer: top.answer, source: 'database', similarity: top.similarity };
          }
          if (top.similarity >= SIM_THRESHOLDS.adapt) {
            const adaptive = await this.generateAdaptiveAnswer(question, candidates.slice(0, 3));
            this.metrics.adaptiveHits++;
            return { answer: adaptive, source: 'openai', similarity: top.similarity };
          }
        }
      }

      // 5. No suitable KB context → pure generative
      const openaiAnswer = await this.getOpenAIResponse(question);
      const answerEmbedding = await this.getOrCreateEmbedding(openaiAnswer, true);
      await this.saveToKnowledgeBase(question, openaiAnswer, questionEmbedding, answerEmbedding);
  this.metrics.generativeHits++;

      return {
        answer: openaiAnswer,
        source: 'openai'
      };

    } catch (error) {
      console.error('Error handling question:', error);
      throw new Error('Failed to process question');
    }
  }
  private tryDirectPattern(q: string): string | null {
  for (const p of DIRECT_PATTERNS) if (p.regex.test(q)) { this.metrics.directPatternHits++; return p.answer; }
    return null;
  }

  private isInScope(message: string): boolean {
    const lower = message.toLowerCase();
    if (lower.trim().length <= 2) return true; // allow very short starters
    if (/^(hi|hey|hello|help)\b/.test(lower)) return true;
  // Fast path: pricing / plan inquiries
  if (/(price|pricing|plan|plans|subscription|cost|upgrade|downgrade|trial|legend|visionary|explorer)/.test(lower)) return true;
  const hits = SCOPE_KEYWORDS.filter(k => lower.includes(k)).length;
    return hits > 0;
  }

  private buildOutOfScopeResponse(): string {
  return "I help with dream life design: Life Blueprint, identity evolution, visualization, 3D dream world features, pricing plans (Explorer / Visionary / Legend), manifest, daily missions, energy & mindset alignment, and EVE coaching. Ask about those areas—e.g. 'How does the Blueprint work?' or 'Explain the plans.'";
  }

  // Candidate retrieval (vector search over KB answers, using question embeddings)
  private async retrieveCandidates(queryEmbedding: number[], topK: number): Promise<Array<{ answer: string; similarity: number }>> {
    try {
      const entries = await KnowledgeBase.find({}).select('answer questionEmbedding');
      if (!entries.length) return [];
      const pool = entries.map(e => ({ content: e.answer, embedding: e.questionEmbedding }));
      const matches = VectorUtils.findTopSimilar(queryEmbedding, pool, SIM_THRESHOLDS.adapt, topK);
      return matches.map(m => ({ answer: m.content, similarity: m.similarity }));
    } catch (e) {
      console.error('Vector retrieval failed:', e);
      return [];
    }
  }

  private async getOpenAIResponse(question: string): Promise<string> {
    try {
  const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are the DreamLife AI guide focused on: dream life design, Life Blueprint questionnaire, identity evolution, values, imagination & visualization, 3D dream world features, pricing plans (Explorer / Visionary / Legend), personalized manifest, daily missions, energy + mindset alignment, habits that reinforce envisioned identity, and EVE coaching. STRICT SCOPE: Redirect anything outside platform + dream life design (e.g. coding, politics, unrelated trivia, explicit medical/ legal advice). Style: concise (2-4 sentences), visionary, clear, encouraging reflective action. Avoid clinical claims; gently suggest professional help for serious health or mental issues. Do NOT over-emphasize generic sleep hygiene unless explicitly asked; prioritize lifestyle architecture and visualization alignment.`
          },
          {
            role: "user",
            content: question
          }
        ],
        max_tokens: 300,
        temperature: 0.7
      });

      return completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please try asking your question again.";

    } catch (error) {
      console.error('Error calling OpenAI:', error);
      throw new Error('Failed to get response from OpenAI');
    }
  }

  // Adaptive answer using OpenAI with KB snippets as context
  private async generateAdaptiveAnswer(question: string, kbEntries: Array<{ answer: string; similarity: number }>): Promise<string> {
    try {
      const context = kbEntries
        .map((e, i) => `Snippet ${i + 1} (sim ${e.similarity.toFixed(2)}): ${e.answer}`)
        .join('\n');
      const systemPrompt = `You are the DreamLife AI guide. Using ONLY meaning from the snippets, create a fresh, concise (2-5 sentences) answer. Blend overlaps, keep tone visionary, grounded, and clarifying. Avoid copying sentences verbatim unless precision requires it. Preserve any pricing numbers if present; do not invent new data.`;
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User question: ${question}\n\nKnowledge snippets:\n${context}` }
        ],
        max_tokens: 260,
        temperature: 0.55
      });
  const content = completion.choices[0]?.message?.content?.trim();
  return content || kbEntries[0]?.answer || 'Let me reflect on that for a moment.';
    } catch (error) {
      console.error('Adaptive generation failed:', error);
      return kbEntries[0]?.answer || 'Let me reflect on that for a moment.';
    }
  }

  private async saveToKnowledgeBase(
    question: string,
    answer: string,
    questionEmbedding: number[],
    answerEmbedding: number[]
  ): Promise<void> {
    try {
      const knowledgeEntry = new KnowledgeBase({
        question: question.trim(),
        answer: answer.trim(),
        questionEmbedding,
        answerEmbedding
      });

      await knowledgeEntry.save();
      console.log('Saved new knowledge entry to database');

    } catch (error) {
      console.error('Error saving to knowledge base:', error);
      // Don't throw error here, as we still want to return the answer to user
    }
  }

  // Utility method to get knowledge base stats
  async getKnowledgeBaseStats(): Promise<{
    totalEntries: number;
    latestEntry?: {
      question: string;
      createdAt: Date;
    };
  }> {
    try {
      const totalEntries = await KnowledgeBase.countDocuments();
      const latestEntry = await KnowledgeBase.findOne()
        .sort({ createdAt: -1 })
        .select('question createdAt')
        .lean();

      return {
        totalEntries,
        latestEntry: latestEntry ? {
          question: latestEntry.question,
          createdAt: latestEntry.createdAt
        } : undefined
      };

    } catch (error) {
      console.error('Error getting knowledge base stats:', error);
      return { totalEntries: 0 };
    }
  }

  // Embedding cache util
  private async getOrCreateEmbedding(text: string, forceNew = false): Promise<number[]> {
    if (!forceNew && this.embeddingCache.has(text)) return this.embeddingCache.get(text)!;
    const emb = await this.embeddingService.generateEmbedding(text);
    if (!forceNew) this.embeddingCache.set(text, emb);
    return emb;
  }

  // Public stats accessor
  public getRuntimeStats() {
    const { totalQueries, scopeRejected, directPatternHits, reuseHits, adaptiveHits, generativeHits } = this.metrics;
    const served = totalQueries - scopeRejected;
    const pct = (n: number) => (served > 0 ? +(100 * n / served).toFixed(1) : 0);
    return {
      totalQueries,
      scopeRejected,
      served,
      distribution: {
        directPattern: { count: directPatternHits, percent: pct(directPatternHits) },
        reuse: { count: reuseHits, percent: pct(reuseHits) },
        adaptive: { count: adaptiveHits, percent: pct(adaptiveHits) },
        generative: { count: generativeHits, percent: pct(generativeHits) }
      },
      cacheSize: this.embeddingCache.size,
      thresholds: SIM_THRESHOLDS
    };
  }
}
