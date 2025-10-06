import mongoose, { Document, Schema } from 'mongoose';

export interface IDreamWorld extends Document {
  userId: string;
  questionnaireId: string;
  worldData: {
    title: string;
    description: string;
    environment: {
      location: string;
      weather: string;
      timeOfDay: string;
      ambiance: string;
    };
    assets: {
      models: string[];
      textures: string[];
      sounds: string[];
      animations: string[];
    };
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
    metadata: {
      generationPrompt: string;
      aiModel: string;
      processingTime: number;
    };
  };
  generationStatus: 'pending' | 'processing' | 'completed' | 'failed';
  generationStartedAt?: Date;
  generationCompletedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const dreamWorldSchema = new Schema<IDreamWorld>({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  questionnaireId: {
    type: String,
    required: true,
    ref: 'Questionnaire',
  },
  worldData: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    environment: {
      location: String,
      weather: String,
      timeOfDay: String,
      ambiance: String,
    },
    assets: {
      models: [String],
      textures: [String],
      sounds: [String],
      animations: [String],
    },
    colors: {
      primary: String,
      secondary: String,
      accent: String,
      background: String,
    },
    metadata: {
      generationPrompt: String,
      aiModel: String,
      processingTime: Number,
    },
  },
  generationStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  generationStartedAt: Date,
  generationCompletedAt: Date,
  errorMessage: String,
}, {
  timestamps: true,
});

// Index for better performance
dreamWorldSchema.index({ userId: 1 });
dreamWorldSchema.index({ questionnaireId: 1 });
dreamWorldSchema.index({ generationStatus: 1 });
dreamWorldSchema.index({ createdAt: -1 });

export const DreamWorld = mongoose.model<IDreamWorld>('DreamWorld', dreamWorldSchema);
