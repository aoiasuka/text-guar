import { Router } from 'express';
import authRoutes from './auth.routes.js';
import contentRoutes from './content.routes.js';
import sensitiveRoutes from './sensitive.routes.js';
import reviewRoutes from './review.routes.js';
import reportRoutes from './report.routes.js';
import logRoutes from './log.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/contents', contentRoutes);
router.use('/sensitive-words', sensitiveRoutes);
router.use('/reviews', reviewRoutes);
router.use('/reports', reportRoutes);
router.use('/logs', logRoutes);

export default router;
