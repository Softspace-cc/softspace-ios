import { Router } from 'express';
import { z } from 'zod';
import { validateBetaCode } from '../lib/betaCodes.js';

const router = Router();

const validateCodeSchema = z.object({
  code: z.string().optional(),
  codeHash: z.string().optional(),
});

router.post('/validate-code', async (req, res, next) => {
  try {
    const { code, codeHash } = validateCodeSchema.parse(req.body ?? {});
    if (!code && !codeHash) {
      return res.status(400).json({ ok: false, message: 'Beta-Code fehlt.' });
    }

    const result = await validateBetaCode({ code, codeHash });
    if (!result.ok) {
      return res.status(403).json(result);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
