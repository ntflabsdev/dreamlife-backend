import { Request, Response } from 'express';
import { DreamWorld } from '../models/DreamWorld';
import { Questionnaire } from '../models/Questionnaire';
import { AuthenticatedRequest } from '../middleware/auth';

interface DreamWorldRequest extends AuthenticatedRequest {
  body: {
    userId?: string;
    questionnaireId?: string;
  };
}

// Generate dream world from questionnaire
export const generateDreamWorld = async (req: DreamWorldRequest, res: Response): Promise<void> => {
  try {
    const { userId, questionnaireId } = req.body;
    
    // Use authenticated user's ID or the provided userId
    const targetUserId = req.userId || userId;
    
    if (!targetUserId) {
      res.status(401).json({
        success: false,
        error: { message: 'User must be authenticated or userId must be provided' },
      });
      return;
    }
    
    // Find the questionnaire
    const questionnaire = await Questionnaire.findOne({ 
      userId: targetUserId,
      ...(questionnaireId && { _id: questionnaireId })
    });
    
    if (!questionnaire) {
      res.status(404).json({
        success: false,
        error: { message: 'Questionnaire not found' },
      });
      return;
    }
    
    if (!questionnaire.isCompleted) {
      res.status(400).json({
        success: false,
        error: { message: 'Questionnaire must be completed before generating dream world' },
      });
      return;
    }
    
    // Check if dream world already exists
    let dreamWorld = await DreamWorld.findOne({ userId: targetUserId });
    
    if (dreamWorld && dreamWorld.generationStatus === 'completed') {
      res.status(200).json({
        success: true,
        data: dreamWorld,
        message: 'Dream world already exists',
      });
      return;
    }
    
    // Create or update dream world
    if (!dreamWorld) {
      dreamWorld = new DreamWorld({
        userId: targetUserId,
        questionnaireId: questionnaire._id,
        worldData: {
          title: '',
          description: '',
          environment: {},
          assets: { models: [], textures: [], sounds: [], animations: [] },
          colors: {},
          metadata: {
            generationPrompt: '',
            aiModel: 'gpt-4',
            processingTime: 0,
          },
        },
        generationStatus: 'pending',
      });
    }
    
    dreamWorld.generationStatus = 'processing';
    dreamWorld.generationStartedAt = new Date();
    await dreamWorld.save();
    
    // Start background processing
    processQuestionnaireIntoWorld(questionnaire, dreamWorld);
    
    res.status(202).json({
      success: true,
      data: {
        id: dreamWorld._id,
        userId: dreamWorld.userId,
        status: dreamWorld.generationStatus,
        message: 'Dream world generation started',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to start dream world generation',
        details: (error as Error).message,
      },
    });
  }
};

// Get dream world status/data
export const getDreamWorld = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    const dreamWorld = await DreamWorld.findOne({ userId });
    
    if (!dreamWorld) {
      res.status(404).json({
        success: false,
        error: { message: 'Dream world not found' },
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: dreamWorld,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get dream world',
        details: (error as Error).message,
      },
    });
  }
};

// Background processing function (simulated)
async function processQuestionnaireIntoWorld(questionnaire: any, dreamWorld: any): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate world data based on questionnaire answers
    const worldData = await generateWorldDataFromAnswers(questionnaire.answers);
    
    dreamWorld.worldData = worldData;
    dreamWorld.generationStatus = 'completed';
    dreamWorld.generationCompletedAt = new Date();
    dreamWorld.worldData.metadata.processingTime = Date.now() - startTime;
    
    await dreamWorld.save();
    
    console.log(`✅ Dream world generated for user: ${dreamWorld.userId}`);
    
  } catch (error) {
    console.error('❌ Dream world generation failed:', error);
    
    dreamWorld.generationStatus = 'failed';
    dreamWorld.errorMessage = (error as Error).message;
    await dreamWorld.save();
  }
}

// Generate world data from questionnaire answers
async function generateWorldDataFromAnswers(answers: any): Promise<any> {
  // This would integrate with AI services like OpenAI, Stability AI, etc.
  // For now, we'll create a basic world based on the answers
  
  const colors = extractColors(answers.colors) || {
    primary: '#4A90E2',
    secondary: '#9013FE',
    accent: '#FF6B6B',
    background: '#1A1B2E'
  };
  
  const location = answers.dream_location || 'A peaceful mountain retreat';
  const environment = {
    location: location,
    weather: extractWeather(answers) || 'Clear and serene',
    timeOfDay: extractTimeOfDay(answers) || 'Golden hour',
    ambiance: answers.dream_feel || 'Peaceful and inspiring'
  };
  
  return {
    title: `${answers.name || 'Your'}'s Dream World`,
    description: answers.dream_sentence || 'A beautiful world crafted from your dreams',
    environment,
    colors,
    assets: {
      models: generateAssetList('models', answers),
      textures: generateAssetList('textures', answers),
      sounds: generateAssetList('sounds', answers),
      animations: generateAssetList('animations', answers),
    },
    metadata: {
      generationPrompt: createGenerationPrompt(answers),
      aiModel: 'gpt-4',
      processingTime: 0, // Will be set later
    },
  };
}

// Helper functions
function extractColors(colorInput: string): any {
  if (!colorInput) return null;
  
  const colorMap: { [key: string]: string } = {
    'blue': '#4A90E2',
    'purple': '#9013FE',
    'green': '#4CAF50',
    'gold': '#FFD700',
    'pink': '#E91E63',
    'orange': '#FF9800',
    'red': '#F44336',
    'black': '#000000',
    'white': '#FFFFFF',
  };
  
  const words = colorInput.toLowerCase().split(/[\s,]+/);
  const foundColors = words.filter(word => colorMap[word]);
  
  if (foundColors.length > 0) {
    return {
      primary: colorMap[foundColors[0]!] || '#4A90E2',
      secondary: colorMap[foundColors[1]!] || '#9013FE',
      accent: colorMap[foundColors[2]!] || '#FF6B6B',
      background: '#1A1B2E'
    };
  }
  
  return null;
}

function extractWeather(answers: any): string {
  const weatherTerms = ['sunny', 'rainy', 'cloudy', 'stormy', 'misty', 'clear'];
  const text = Object.values(answers).join(' ').toLowerCase();
  
  for (const term of weatherTerms) {
    if (text.includes(term)) {
      return term.charAt(0).toUpperCase() + term.slice(1);
    }
  }
  
  return 'Clear';
}

function extractTimeOfDay(answers: any): string {
  const timeTerms = ['morning', 'afternoon', 'evening', 'night', 'dawn', 'sunset', 'golden hour'];
  const text = Object.values(answers).join(' ').toLowerCase();
  
  for (const term of timeTerms) {
    if (text.includes(term)) {
      return term.charAt(0).toUpperCase() + term.slice(1);
    }
  }
  
  return 'Golden hour';
}

function generateAssetList(type: string, answers: any): string[] {
  // This would normally call AI services to generate actual assets
  // For now, return placeholder asset names based on answers
  
  const assets: string[] = [];
  
  switch (type) {
    case 'models':
      if (answers.home_look) assets.push('dream_house_model.glb');
      if (answers.assets) assets.push('luxury_car_model.glb');
      if (answers.objects) assets.push('personal_items_model.glb');
      break;
    case 'textures':
      assets.push('environment_texture.jpg', 'sky_texture.hdr');
      break;
    case 'sounds':
      if (answers.music) assets.push('ambient_music.mp3');
      assets.push('nature_sounds.mp3');
      break;
    case 'animations':
      assets.push('character_idle.fbx', 'environment_ambient.fbx');
      break;
  }
  
  return assets;
}

function createGenerationPrompt(answers: any): string {
  return `Create a 3D world for ${answers.name || 'someone'} who dreams of ${answers.dream_sentence || 'their ideal life'}. 
  They want to live in ${answers.dream_location || 'a beautiful place'} and feel ${answers.dream_feel || 'happy and fulfilled'}.
  Key elements: ${answers.core_values || 'peace and happiness'}.
  Environment: ${answers.home_look || 'beautiful home'}.
  Colors: ${answers.colors || 'vibrant and inspiring'}.`;
}
