import mongoose, { Document, Schema } from 'mongoose';

// Interface for the questionnaire answers based on frontend structure
interface IQuestionnaireAnswers {
  // Identity & Vision
  name?: string;
  dream_sentence?: string;
  core_values?: string;
  
  // Home & Environment
  dream_location?: string;
  home_look?: string;
  home_details?: string;
  home_feelings?: string;
  
  // Body & Health
  body_look?: string;
  body_feel?: string;
  health_habits?: string;
  
  // Daily Lifestyle
  perfect_day?: string;
  habits_rituals?: string;
  weekends?: string;
  
  // Career & Purpose
  fulfillment?: string;
  workday?: string;
  work_impact?: string;
  
  // Relationships
  key_people?: string;
  romantic_relationship?: string;
  social_circle?: string;
  
  // Experiences & Freedom
  adventures?: string;
  travel?: string;
  recurring_moment?: string;
  
  // Money & Abundance
  financial_reality?: string;
  assets?: string;
  money_use?: string;
  
  // Mental State
  dream_feel?: string;
  state_of_mind?: string;
  morning_thoughts?: string;
  
  // Legacy & Big Goals
  legacy?: string;
  remembered?: string;
  big_contribution?: string;
  
  // Bonus – Visual & Detail Questions
  colors?: string;
  music?: string;
  objects?: string;
  first_moment?: string;
}

export interface IQuestionnaire extends Document {
  userId: string;
  answers: IQuestionnaireAnswers;
  currentStep: number;
  isCompleted: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const questionnaireSchema = new Schema<IQuestionnaire>({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  answers: {
    type: Schema.Types.Mixed,
    default: {},
  },
  currentStep: {
    type: Number,
    default: 0,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true, 
});

questionnaireSchema.index({ userId: 1 });
questionnaireSchema.index({ createdAt: -1 });

export const Questionnaire = mongoose.model<IQuestionnaire>('Questionnaire', questionnaireSchema);
