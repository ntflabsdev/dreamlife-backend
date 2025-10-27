import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface ProviderProfile {
  provider: 'google' | 'apple';
  providerId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<ProviderProfile | null> {
  // First attempt: standard Google ID token verification
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (payload && payload.sub) {
      return {
        provider: 'google',
        providerId: payload.sub,
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
      };
    }
  } catch (primaryErr) {
    // If fails due to PEM not found, try Firebase securetoken variant
    const headerPart = idToken.split('.')[0];
    try {
    if (!headerPart) throw new Error('Missing JWT header');
    const headerJson = Buffer.from(headerPart, 'base64').toString('utf8');
      const header = JSON.parse(headerJson);
      if (!header.kid) throw new Error('No kid in token header');
      // Fetch Firebase certs
      const jwksUrl = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
      const { data } = await axios.get(jwksUrl);
      const jwk = (data.keys || []).find((k: any) => k.kid === header.kid);
      if (!jwk) throw new Error('Matching JWK not found');
      const pem = jwkToPem(jwk);
      const decoded: any = jwt.verify(idToken, pem, { algorithms: ['RS256'] });
      let expectedAud = process.env.FIREBASE_PROJECT_ID; // may be undefined or placeholder
      if (!expectedAud || expectedAud === 'your-firebase-project-id') {
        expectedAud = undefined; // treat placeholder as not set
      }
      const isFirebaseIssuer = typeof decoded.iss === 'string' && decoded.iss.startsWith('https://securetoken.google.com/');
  if (expectedAud) {
        const expectedIss = `https://securetoken.google.com/${expectedAud}`;
        if (decoded.aud !== expectedAud || decoded.iss !== expectedIss) {
          console.warn('Firebase token aud/iss mismatch:', { expectedAud, tokenAud: decoded.aud, expectedIss, tokenIss: decoded.iss });
          return null;
        }
      } else if (!isFirebaseIssuer) {
        console.warn('Token issuer not recognized as Firebase securetoken, skipping. Issuer:', decoded.iss);
        return null;
      }
      return {
        provider: 'google',
        providerId: decoded.user_id || decoded.sub,
        email: decoded.email,
        firstName: decoded.name ? decoded.name.split(' ')[0] : undefined,
        lastName: decoded.name ? decoded.name.split(' ').slice(1).join(' ') || undefined : undefined,
      };
    } catch (fallbackErr) {
      console.error('Google token verify failed (fallback):', fallbackErr, 'primary:', primaryErr);
      return null;
    }
  }
  return null;
}

// Simplified Apple token verification placeholder (real-world needs JWT signature verify with Apple public keys)
export async function verifyAppleIdToken(idToken: string): Promise<ProviderProfile | null> {
  try {
    // Retrieve Apple public keys
    const { data } = await axios.get('https://appleid.apple.com/auth/keys');
    // NOTE: Proper implementation would: decode JWT header, select matching key, verify signature.
    // For now, we decode payload without signature enforcement (NOT FOR PRODUCTION).
  const parts = idToken?.split('.') || [];
  if (parts.length < 2 || !parts[1]) return null;
  const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (!payload.sub) return null;
    return {
      provider: 'apple',
      providerId: payload.sub,
      email: payload.email,
      firstName: payload.name?.firstName,
      lastName: payload.name?.lastName,
    };
  } catch (e) {
    console.error('Apple token verify failed:', e);
    return null;
  }
}
