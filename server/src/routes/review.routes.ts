import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/review.controller.js';

const router = Router();

router.get(
  '/pending',
  auth,
  requirePermission('review:pending'),
  validate(ctrl.reviewQuerySchema, 'query'),
  wrap(ctrl.pendingController),
);
router.get(
  '/history',
  auth,
  requirePermission('review:history'),
  validate(ctrl.reviewQuerySchema, 'query'),
  wrap(ctrl.historyController),
);
router.post(
  '/batch',
  auth,
  requirePermission('review:batch'),
  validate(ctrl.batchReviewSchema),
  wrap(ctrl.batchController),
);
router.post(
  '/:contentId/approve',
  auth,
  requirePermission('review:approve'),
  validate(ctrl.reviewBodySchema),
  wrap(ctrl.approveController),
);
router.post(
  '/:contentId/reject',
  auth,
  requirePermission('review:reject'),
  validate(ctrl.reviewBodySchema),
  wrap(ctrl.rejectController),
);

export default router;
