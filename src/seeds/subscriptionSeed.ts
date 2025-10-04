import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Interface for PayPal access token response
interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Interface for plan data
interface PlanData {
  name: string;
  description: string;
  price: string;
  setupFee: string;
  trialDays: number;
}

// Plan definitions based on your pricing cards
const PLAN_DEFINITIONS = {
  visionary: {
    name: 'Visionary (Core Plan)',
    description: 'Full 3D interactive scene, customize house, parking, environment',
    price: '14.99',
    setupFee: '0',
    trialDays: 7
  },
  legend: {
    name: 'Legend (VIP Plan)', 
    description: 'All features unlocked, Advanced Mirror Mode, AI Dream Coach',
    price: '34.99',
    setupFee: '0',
    trialDays: 14
  }
} as const;

// Get PayPal access token
const getPayPalAccessToken = async (): Promise<string> => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseURL = process.env.NODE_ENV === 'production' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post<PayPalAccessTokenResponse>(
      `${baseURL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    return response.data.access_token;
  } catch (error: any) {
    console.error('❌ Error getting PayPal access token:', error.response?.data || error.message);
    throw new Error('Failed to get PayPal access token');
  }
};

// Create PayPal product (required before creating plans)
const createPayPalProduct = async (accessToken: string): Promise<string> => {
  const baseURL = process.env.NODE_ENV === 'production' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  const productData = {
    name: 'DreamLife Subscription',
    description: 'DreamLife AI-powered life visualization and affirmation service',
    type: 'SERVICE',
    category: 'SOFTWARE'
  };

  try {
    const response = await axios.post(
      `${baseURL}/v1/catalogs/products`,
      productData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'PayPal-Request-Id': `product-${Date.now()}`,
        },
      }
    );
    
    console.log('✅ PayPal product created:', response.data.id);
    return response.data.id;
  } catch (error: any) {
    if (error.response?.data?.name === 'DUPLICATE_REQUEST_ID') {
      console.log('⚠️ Product already exists, attempting to fetch existing product...');
      return 'PROD_EXISTING';
    }
    console.error('❌ Error creating PayPal product:', error.response?.data || error.message);
    throw new Error('Failed to create PayPal product');
  }
};

// Create PayPal subscription plan
const createPayPalPlan = async (
  accessToken: string, 
  productId: string, 
  planData: PlanData
): Promise<any> => {
  const baseURL = process.env.NODE_ENV === 'production' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  const billingCycles: any[] = [];

  // Add trial period if specified
  if (planData.trialDays && planData.trialDays > 0) {
    billingCycles.push({
      frequency: {
        interval_unit: 'DAY',
        interval_count: planData.trialDays
      },
      tenure_type: 'TRIAL',
      sequence: 1,
      total_cycles: 1
    });
  }

  // Add regular billing cycle
  billingCycles.push({
    frequency: {
      interval_unit: 'MONTH',
      interval_count: 1
    },
    tenure_type: 'REGULAR',
    sequence: planData.trialDays ? 2 : 1,
    total_cycles: 0, // 0 means infinite
    pricing_scheme: {
      fixed_price: {
        value: planData.price,
        currency_code: 'USD'
      }
    }
  });

  const plan = {
    product_id: productId,
    name: planData.name,
    description: planData.description,
    billing_cycles: billingCycles,
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: planData.setupFee !== '0' ? {
        value: planData.setupFee,
        currency_code: 'USD'
      } : undefined,
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  };

  try {
    const response = await axios.post(
      `${baseURL}/v1/billing/plans`,
      plan,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'PayPal-Request-Id': `plan-${Date.now()}-${Math.random()}`,
        },
      }
    );
    
    return response.data;
  } catch (error: any) {
    console.error('❌ Error creating PayPal plan:', error.response?.data || error.message);
    throw new Error(`Failed to create PayPal plan: ${planData.name}`);
  }
};

// List existing PayPal plans
const listPayPalPlans = async (accessToken: string, productId?: string): Promise<any[]> => {
  const baseURL = process.env.NODE_ENV === 'production' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  try {
    let url = `${baseURL}/v1/billing/plans?page_size=20`;
    if (productId && productId !== 'PROD_EXISTING') {
      url += `&product_id=${productId}`;
    }

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    return response.data.plans || [];
  } catch (error: any) {
    console.error('❌ Error listing PayPal plans:', error.response?.data || error.message);
    return [];
  }
};

// Save plan data to JSON file
const savePlansToFile = (plans: any) => {
  const dataDir = path.join(__dirname, '../data');
  const filePath = path.join(dataDir, 'paypal-plans.json');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(plans, null, 2));
  console.log('💾 Plans saved to:', filePath);
};

// Load existing plans from file
const loadPlansFromFile = (): any => {
  const filePath = path.join(__dirname, '../data/paypal-plans.json');
  
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('⚠️ Error reading plans file, will create new one');
      return null;
    }
  }
  
  return null;
};

// Main seed function
export const seedSubscriptionPlans = async (): Promise<void> => {
  try {
    console.log('🌱 Starting subscription plans seeding...');
    
    // Check if plans already exist in file
    const existingPlans = loadPlansFromFile();
    if (existingPlans && existingPlans.visionaryPlan && existingPlans.legendPlan) {
      console.log('✅ Plans already exist:');
      console.log('📋 Visionary Plan:', existingPlans.visionaryPlan.id, '- $' + existingPlans.visionaryPlan.price);
      console.log('📋 Legend Plan:', existingPlans.legendPlan.id, '- $' + existingPlans.legendPlan.price);
      return;
    }
    
    // Get access token
    const accessToken = await getPayPalAccessToken();
    console.log('✅ PayPal access token obtained');
    
    // List existing plans to check what we have
    console.log('🔍 Checking existing PayPal plans...');
    const existingPayPalPlans = await listPayPalPlans(accessToken);
    
    let visionaryPlan = existingPayPalPlans.find(plan => 
      plan.name.includes('Visionary') || plan.name.includes('Core')
    );
    let legendPlan = existingPayPalPlans.find(plan => 
      plan.name.includes('Legend') || plan.name.includes('VIP')
    );
    
    if (visionaryPlan) {
      console.log('📋 Found existing Visionary Plan:', visionaryPlan.id, '- Status:', visionaryPlan.status);
    }
    if (legendPlan) {
      console.log('📋 Found existing Legend Plan:', legendPlan.id, '- Status:', legendPlan.status);
    }
    
    let productId = '';
    
    // Create plans if missing
    if (!visionaryPlan || !legendPlan) {
      console.log('🏗️ Creating missing plans...');
      
      // Create product first
      productId = await createPayPalProduct(accessToken);
      
      if (!visionaryPlan) {
        console.log('🔨 Creating Visionary Plan...');
        const visionaryPlanData = PLAN_DEFINITIONS.visionary;
        visionaryPlan = await createPayPalPlan(accessToken, productId, visionaryPlanData);
        console.log('✅ Visionary Plan created:', visionaryPlan.id);
      }
      
      if (!legendPlan) {
        console.log('🔨 Creating Legend Plan...');
        const legendPlanData = PLAN_DEFINITIONS.legend;
        legendPlan = await createPayPalPlan(accessToken, productId, legendPlanData);
        console.log('✅ Legend Plan created:', legendPlan.id);
      }
    }
    
    // Save plans to file
    const visionaryDef = PLAN_DEFINITIONS.visionary;
    const legendDef = PLAN_DEFINITIONS.legend;
    
    const planData = {
      productId: productId || 'existing',
      visionaryPlan: {
        id: visionaryPlan.id,
        name: visionaryPlan.name,
        description: visionaryPlan.description || visionaryDef.description,
        price: visionaryDef.price,
        setupFee: visionaryDef.setupFee,
        trialDays: visionaryDef.trialDays,
        status: visionaryPlan.status,
        features: [
          'Full 3D interactive scene',
          'Customize house, parking, environment',
          'Mirror Mode: see your dream body',
          'Add 1 car + future partner',
          'Great entry point for serious users'
        ]
      },
      legendPlan: {
        id: legendPlan.id,
        name: legendPlan.name,
        description: legendPlan.description || legendDef.description,
        price: legendDef.price,
        setupFee: legendDef.setupFee,
        trialDays: legendDef.trialDays,
        status: legendPlan.status,
        features: [
          'All features unlocked',
          'Advanced Mirror Mode: body + face + emotions',
          'AI Dream Coach (daily sessions)',
          'Dream life video generation',
          'Access to private Visionaries Community'
        ]
      },
      lastUpdated: new Date().toISOString()
    };
    
    savePlansToFile(planData);
    
    console.log('🎉 Subscription plans seeding completed successfully!');
    console.log('📋 Final Plans:');
    console.log('   • Visionary Plan:', planData.visionaryPlan.id, '- $' + planData.visionaryPlan.price);
    console.log('   • Legend Plan:', planData.legendPlan.id, '- $' + planData.legendPlan.price);
    
  } catch (error: any) {
    console.error('💥 Error seeding subscription plans:', error.message);
    throw error;
  }
};

// Get seeded plans from file
export const getSeededPlans = (): any => {
  return loadPlansFromFile();
};

// Get subscription plans for API endpoint
export const getSubscriptionPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const plansData = loadPlansFromFile();
    
    if (plansData && plansData.visionaryPlan && plansData.legendPlan) {
      const plans = {
        basicPlan: {
          id: plansData.visionaryPlan.id,
          name: plansData.visionaryPlan.name,
          description: plansData.visionaryPlan.description,
          price: plansData.visionaryPlan.price,
          setupFee: plansData.visionaryPlan.setupFee,
          trialDays: plansData.visionaryPlan.trialDays,
          features: plansData.visionaryPlan.features
        },
        premiumPlan: {
          id: plansData.legendPlan.id,
          name: plansData.legendPlan.name,
          description: plansData.legendPlan.description,
          price: plansData.legendPlan.price,
          setupFee: plansData.legendPlan.setupFee,
          trialDays: plansData.legendPlan.trialDays,
          features: plansData.legendPlan.features
        }
      };
      
      res.status(200).json({
        success: true,
        data: plans
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: {
        message: 'No subscription plans found. Please run seeding first.',
        details: 'Plans need to be initialized'
      }
    });
    
  } catch (error: any) {
    console.error('Error getting subscription plans:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get subscription plans',
        details: error.message
      }
    });
  }
};


// Get subscription details
export const getSubscriptionDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params;
    
    if (!subscriptionId) {
      res.status(400).json({
        success: false,
        error: { message: 'Subscription ID is required' }
      });
      return;
    }
    
    const accessToken = await getPayPalAccessToken();
    const baseURL = process.env.NODE_ENV === 'production' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com';
    
    const response = await axios.get(
      `${baseURL}/v1/billing/subscriptions/${subscriptionId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      }
    );
    
    res.status(200).json({
      success: true,
      data: response.data
    });
    
  } catch (error: any) {
    console.error('Error getting subscription details:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get subscription details',
        details: error.message
      }
    });
  }
};

// Initialize subscription plans (alias for seedSubscriptionPlans)
export const initializeSubscriptionPlans = seedSubscriptionPlans;
