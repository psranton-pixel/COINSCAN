import express, { Request, Response } from 'express';
import { identifyAndValuateCoin } from './geminiService';

export const apiRouter = express.Router();

apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.post('/identify-coin', async (req: Request, res: Response) => {
  try {
    const { obverseImage, reverseImage, currency = 'USD' } = req.body;

    if (!obverseImage) {
      return res.status(400).json({ error: 'obverseImage (front of coin) is required' });
    }

    const identification = await identifyAndValuateCoin(obverseImage, reverseImage, currency);
    return res.json(identification);
  } catch (error: any) {
    console.error('Error in /api/identify-coin:', error);
    const message = error instanceof Error ? error.message : 'Coin identification failed';
    const statusCode = error?.statusCode || 500;
    const isRetryable = !!error?.isRetryable;
    return res.status(statusCode).json({
      error: message,
      retryable: isRetryable,
    });
  }
});

apiRouter.post('/valuate-coin', async (req: Request, res: Response) => {
  try {
    const { obverseImage, reverseImage, currency = 'USD' } = req.body;
    if (!obverseImage) {
      return res.status(400).json({ error: 'Coin image required for valuation' });
    }

    const valuation = await identifyAndValuateCoin(obverseImage, reverseImage, currency);
    return res.json({
      estimatedValue: valuation.estimatedValue,
      lowValue: valuation.lowValue,
      highValue: valuation.highValue,
      bullionMeltValue: valuation.bullionMeltValue,
      faceValue: valuation.faceValue,
      currency: valuation.currency,
      valuationConfidence: valuation.valuationConfidence,
      valuationDate: valuation.valuationDate,
      recentAuctionComps: valuation.recentAuctionComps,
    });
  } catch (error: any) {
    console.error('Error in /api/valuate-coin:', error);
    const message = error instanceof Error ? error.message : 'Valuation refresh failed';
    const statusCode = error?.statusCode || 500;
    const isRetryable = !!error?.isRetryable;
    return res.status(statusCode).json({
      error: message,
      retryable: isRetryable,
    });
  }
});
