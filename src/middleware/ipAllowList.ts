import { Request, Response, NextFunction } from 'express';

// Allows restricting access to specified IP addresses when deployed publicly (e.g. via ngrok)
// Configuration:
//   ALLOWED_IPS=1.2.3.4,5.6.7.8,10.*  (supports simple '*' suffix wildcard)
// If ALLOWED_IPS is not set or empty, middleware is a no-op.
// Always allows localhost (127.0.0.1, ::1) and internal private addresses.

const isPrivateOrLocal = (ip: string) => {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('::ffff:127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
    ip.startsWith('172.2') // covers 172.20 - 172.29 blocks (rough grouping for simplicity)
  );
};

const matchPattern = (ip: string, pattern: string) => {
  if (pattern === ip) return true;
  if (pattern.endsWith('*')) {
    return ip.startsWith(pattern.slice(0, -1));
  }
  return false;
};

export const ipAllowList = (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = process.env.ALLOWED_IPS || '';
    if (!raw.trim()) return next(); // No restrictions configured
    if (process.env.NODE_ENV === 'development') return next();

    const patterns = raw.split(',').map(p => p.trim()).filter(Boolean);
    if (!patterns.length) return next();

    // req.ips populated when trust proxy enabled; fallback to req.ip
    const candidateIps = (req as any).ips && (req as any).ips.length ? (req as any).ips : [req.ip];

  const allowed = candidateIps.some((ip: string) => {
      // Strip IPv6 prefix if present (::ffff:)
      const norm = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
      if (isPrivateOrLocal(norm)) return true;
      return patterns.some(p => matchPattern(norm, p));
    });

    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Access denied by IP allow list' });
    }
    return next();
  } catch (e) {
    console.error('IP allow list middleware error:', e);
    // Fail open to avoid accidental lock-out
    return next();
  }
};

export default ipAllowList;
