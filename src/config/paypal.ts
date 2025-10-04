import { Client, Environment } from '@paypal/paypal-server-sdk';
import 'dotenv/config';
let paypalClientInstance: Client | null = null;

export const getPaypalClient = (): Client => {
  if (!paypalClientInstance) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const environment = process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox;
    console.log("PayPal Environment:", environment);
    console.log("PayPal Client ID:", clientId ? 'Provided' : 'Not Provided');
    console.log("PayPal Client Secret:", clientSecret ? 'Provided' : 'Not Provided');

    if (!clientId || !clientSecret) {
      throw new Error('PayPal configuration missing. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.');
    }

    paypalClientInstance = new Client({
      environment,
      clientCredentialsAuthCredentials: {
        oAuthClientId: clientId,
        oAuthClientSecret: clientSecret,
      },
    });
  }

  return paypalClientInstance;
};

// Backward compatibility export
export const paypalClient = getPaypalClient();

export { Environment };
