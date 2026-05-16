import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/review.controller.js';

const router = Router();
const admin = [auth, requireRole('admin')] as const;

router.get('/pending', ...admin, validate(ctrl.reviewQuerySchema, 'query'), wrap(ctrl.pendingController));
router.get('/history', ...admin, validate(ctrl.reviewQuerySchema, 'query'), wrap(ctrl.historyController));
router.post('/batch', ...admin, validate(ctrl.batchReviewSchema), wrap(ctrl.batchController));
router.post('/:contentId/approve', ...admin, validate(ctrl.reviewBodySchema), wrap(ctrl.approveController));
router.post('/:contentId/reject', ...admin, validate(ctrl.reviewBodySchema), wrap(ctrl.rejectController));

export default router;
