import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { users, refreshTokens } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token';
import crypto from 'crypto';
import logger from '../utils/logger';

const SALT_ROUNDS = 12;

const AuthService = {
  async register(req: Request, res: Response) {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'Email, password and name are required' });
      }

      const existing = await db.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const [user] = await db.insert(users).values({ email, passwordHash, name }).returning({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      });

      const tokenPayload = { userId: user.id, email: user.email };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({ userId: user.id, tokenHash: refreshTokenHash, expiresAt });

      res.status(201).json({
        success: true,
        data: { token: accessToken, refreshToken, user },
      });
    } catch (error) {
      logger.error(error, 'Register failed');
      res.status(500).json({ success: false, message: 'Registration failed' });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const tokenPayload = { userId: user.id, email: user.email };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({ userId: user.id, tokenHash: refreshTokenHash, expiresAt });

      res.json({
        success: true,
        data: {
          token: accessToken,
          refreshToken,
          user: { id: user.id, email: user.email, name: user.name },
        },
      });
    } catch (error) {
      logger.error(error, 'Login failed');
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  },

  async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ success: false, message: 'Refresh token required' });
      }

      const decoded = verifyRefreshToken(refreshToken);
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
      if (!stored) {
        return res.status(401).json({ success: false, message: 'Invalid refresh token' });
      }

      if (new Date() > stored.expiresAt) {
        await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));
        return res.status(401).json({ success: false, message: 'Refresh token expired' });
      }

      await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

      const [user] = await db.select().from(users).where(eq(users.id, decoded.userId));
      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      const tokenPayload = { userId: user.id, email: user.email };
      const newAccessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({ userId: user.id, tokenHash: newRefreshTokenHash, expiresAt });

      res.json({
        success: true,
        data: { token: newAccessToken, refreshToken: newRefreshToken },
      });
    } catch (error) {
      logger.error(error, 'Token refresh failed');
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
  },

  async logout(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
      }

      res.json({ success: true, message: 'Logged out' });
    } catch (error) {
      logger.error(error, 'Logout failed');
      res.status(500).json({ success: false, message: 'Logout failed' });
    }
  },

  async me(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;

      const [user] = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        telegramChatId: users.telegramChatId,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId));

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      logger.error(error, 'Get user failed');
      res.status(500).json({ success: false, message: 'Failed to get user' });
    }
  },
};

export default AuthService;
