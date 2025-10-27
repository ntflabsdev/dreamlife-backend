import { EmbeddingService } from '../services/embeddingService';
import { KnowledgeBase } from '../models/KnowledgeBase';
import { VectorUtils } from '../utils/vectorUtils';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Single simplified service: one public method (handleQuestion) + optional stats.
export class ChatService {
  private embeddingService = new EmbeddingService();
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private cache: Map<string, number[]> = new Map();
  private metrics = { total: 0, scopeBlocked: 0, reused: 0, adapted: 0, generated: 0 };

  // Common intent patterns answered deterministically (fast, no token cost)
  private directPatterns: { regex: RegExp; answer: string }[] = [
    {
      regex: /^(are you (an )?ai|what are you|who are you)$/i,
      answer: "I'm an AI guide for DreamLife design. I help you shape your Life Blueprint, clarify identity & values, visualize your 3D dream world, set missions, refine energy & mindset, and navigate pricing plans. Ask anything within those areas.",
    },
    {
      regex: /(how (do|can) i (use|start with) (this|the) (app|platform)|where do i start|getting started|onboard)/i,
      answer: "Getting started: 1) Complete the Life Blueprint questionnaire to map vision, values, identity. 2) Explore and customize your 3D dream world (home, avatars, mirror mode). 3) Set 1-3 daily missions aligned with your vision. 4) Review and refine your manifest weekly. Ask me for help on any step if stuck.",
    },
    {
      regex: /(i feel stuck|stuck where|stuck what do i do|i'm stuck)/i,
      answer: "If you feel stuck: zoom out to your envisioned lifestyle, pick one small mission that reinforces identity (e.g. 'visualize 5 min', 'write 2 value sentences'), and log it. Momentum starts with tiny aligned actions. Want help crafting that first mission?",
    },
    {
      regex: /(i (dont|don't) know my passion|find my passion)/i,
      answer: "To uncover passion: look at recurring curiosities, emotional spikes (inspiration, frustration), and values you refuse to compromise. Run micro experiments (15–30 min sessions) tied to those clues, log feelings after. Patterns across experiments become your passion signals.",
    },
    {
      regex: /(career change|change careers|switch careers)/i,
      answer: "For a career change: define your future identity (who you want to be daily), list transferable strengths, run low-risk skill probes (projects / learning sprints), and align each step with your Life Blueprint values. Treat it as a phased mission sequence, not a leap.",
    },
    {
      regex: /(choose a career|career path|which career)/i,
      answer: "Choosing a career: intersect your core values, energizing activities, and marketable problems you want to solve. Prototype 2–3 micro projects in those zones, evaluate energy + growth + contribution afterwards. The highest composite score guides your next mission arc.",
    },
    {
      regex: /(what skills should i build|skills to build|which skills)/i,
      answer: "Skill selection: pick skills that amplify your envisioned identity + unlock leverage (creation, communication, systems). Score candidate skills by relevance to vision, excitement, and long-term adaptability. Start with one deep focus + one supporting skill to avoid dilution.",
    },
    {
      regex: /(get promoted faster|promotion faster|advance quicker)/i,
      answer: "Promotion acceleration: clarify the success scoreboard (metrics + behaviors), over-communicate progress tied to team outcomes, document improvements weekly, and embody a leadership identity (proactive problem framing + solution proposals). Align actions with your Blueprint values for sustainability.",
    },
  ];

  // Main entry when user asks a question
  async handleQuestion(question: string): Promise<{ answer: string; mode: 'reused' | 'adapted' | 'generated' | 'blocked'; source: 'database' | 'openai'; similarity?: number } > {
    this.metrics.total++;
    const q = (question || '').trim();
    if (!q) return { answer: 'Please ask a complete question about your dream life design.', mode: 'blocked', source: 'openai' };

    // Simple scope & greeting allowance
    const lower = q.toLowerCase();
    // Hard out-of-scope: technical coding, politics, pure medical, gambling, crypto etc.
    const OUT_OF_SCOPE = /(javascript|python|react|code|bug|error|sql|politic|election|president|covid|diagnos|treatment|medical advice|crypto|gambling|lottery|betting)/i;
    if (OUT_OF_SCOPE.test(lower)) {
      this.metrics.scopeBlocked++;
      return { answer: "That topic is outside DreamLife design scope. Ask me about Life Blueprint, identity, visualization, dream world, missions, pricing plans, or alignment.", mode: 'blocked', source: 'openai' };
    }

    // Direct deterministic intent patterns
    for (const p of this.directPatterns) {
      if (p.regex.test(lower)) {
        this.metrics.reused++;
        return { answer: p.answer, mode: 'reused', source: 'database', similarity: 1 };
      }
    }

    // Pricing pattern (still deterministic)
    if (/(price|pricing|plan|plans|subscription|legend|visionary|explorer|how much|upgrade|downgrade|trial)/i.test(lower)) {
      const pricingAnswer = 'Pricing: Explorer (Free) starter static scene + partial Blueprint. Visionary ($14.99/mo, 14‑day trial) full interactive 3D world, customization, mirror body, one vehicle, future partner avatar. Legend ($34.99/mo, 14‑day trial) advanced mirror (body+face+emotions), daily AI Dream Coach, dream life video generation, private community. Upgrades instant; downgrades next cycle; 50% student discount.';
      this.metrics.reused++;
      return { answer: pricingAnswer, mode: 'reused', source: 'database', similarity: 1 };
    }

    // 1. Embed question
    const qEmbedding = await this.embed(q);

    // 2. Load KB (questions + answers + embeddings of question)
    const entries = await KnowledgeBase.find({}).select('question answer questionEmbedding');
    const pool = entries.map(e => ({ question: e.question, answer: e.answer, embedding: e.questionEmbedding }));

    let topSim = 0; let topAnswer = '';
    let topMatches: Array<{ question: string; answer: string; similarity: number }> = [];
    if (pool.length) {
      const vectors = pool.map(p => ({ content: p.answer, embedding: p.embedding }));
      const matches = VectorUtils.findTopSimilar(qEmbedding, vectors, 0.4, 5); // broader threshold 0.4
      topMatches = matches.map(m => ({ question: pool.find(p => p.answer === m.content)?.question || '', answer: m.content, similarity: m.similarity }));
      const first = topMatches[0];
      if (first) { topSim = first.similarity; topAnswer = first.answer; }
    }

    // Decide mode based on similarity bands
    let mode: 'reused' | 'adapted' | 'generated' = 'generated';
    if (topSim >= 0.9) mode = 'reused'; else if (topSim >= 0.65) mode = 'adapted';

    // If exact reuse high similarity, short‑circuit
    if (mode === 'reused' && topAnswer) {
      this.metrics.reused++;
      return { answer: topAnswer, mode, source: 'database', similarity: topSim };
    }

    // Build context snippets for LLM (adapt or generate)
    const context = topMatches.map((m,i) => `Snippet ${i+1} (sim ${m.similarity.toFixed(2)}): Q: ${m.question}\nA: ${m.answer}`).join('\n');

    const system = `You are the DreamLife AI guide. Scope ONLY: dream life design, Life Blueprint questionnaire, identity evolution, values, imagination & visualization, 3D dream world features, pricing plans (Explorer / Visionary / Legend), manifest, daily missions, energy & mindset alignment, EVE / Dream coach guidance. If user asks outside scope politely redirect. STYLE: concise (2-4 sentences), visionary, clear, encouraging action. If similarity mode is reused: output the closest answer verbatim (light formatting ok). If adapted: merge meaning from snippets without copying whole sentences unless needed. If generated: create a fresh answer consistent with platform concepts. Never fabricate pricing numbers. If health/medical/therapy specifics appear, stay general and recommend professional help if serious.`;

    const userMsg = `User question: ${q}\nMode: ${mode}\nTop similarity: ${topSim.toFixed(2)}\nKnowledge snippets (may be empty):\n${context || '(no relevant snippets above threshold)'}\n\nTask: Provide the best answer now.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [ { role: 'system', content: system }, { role: 'user', content: userMsg } ],
      temperature: mode === 'generated' ? 0.7 : 0.5,
      max_tokens: 260
    });
    const answer = completion.choices[0]?.message?.content?.trim() || topAnswer || 'Let me reflect on that.';

    // Metrics
    if (mode === 'adapted') this.metrics.adapted++; else if (mode === 'generated') this.metrics.generated++;

    // Persist new knowledge ONLY for generated answers (avoid polluting with adapted paraphrases)
    if (mode === 'generated') {
      try {
        const answerEmbedding = await this.embed(answer, true);
        await new KnowledgeBase({ question: q, answer, questionEmbedding: qEmbedding, answerEmbedding }).save();
      } catch (e) { console.error('KB save failed (non-fatal):', e); }
    }

    return { answer, mode, source: mode === 'generated' ? 'openai' : 'openai', similarity: topSim || undefined };
  }

  // Minimal stats accessor kept
  getRuntimeStats() {
    const { total, scopeBlocked, reused, adapted, generated } = this.metrics;
    const answered = total - scopeBlocked;
    const pct = (n:number)=> answered>0? +((n/answered)*100).toFixed(1):0;
    return { total, scopeBlocked, answered, distribution: { reused:{count:reused,percent:pct(reused)}, adapted:{count:adapted,percent:pct(adapted)}, generated:{count:generated,percent:pct(generated)} }, cacheSize: this.cache.size };
  }

  // Lightweight embed helper (inline cache)
  private async embed(text: string, force = false) {
    if (!force && this.cache.has(text)) return this.cache.get(text)!;
    const emb = await this.embeddingService.generateEmbedding(text);
    if (!force) this.cache.set(text, emb);
    return emb;
  }
}
