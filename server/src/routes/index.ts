import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler } from '../utils/async.js';
import * as authController from '../controllers/auth.controller.js';
import * as contentController from '../controllers/content.controller.js';
import * as sensitiveController from '../controllers/sensitive.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as reportController from '../controllers/report.controller.js';
import * as logController from '../controllers/log.controller.js';

const router = Router();
const wrap = asyncHandler;

router.post('/auth/login', validate(authController.loginSchema), wrap(authController.loginController));
router.post(
  '/auth/register',
  auth,
  requireRole('admin'),
  validate(authController.registerSchema),
  wrap(authController.registerController),
);
router.get('/auth/profile', auth, wrap(authController.profileController));
router.put('/auth/password', auth, validate(authController.passwordSchema), wrap(authController.passwordController));

router.get('/contents', auth, validate(contentController.pageQuerySchema, 'query'), wrap(contentController.listController));
router.post('/contents/detect', auth, requireRole('editor', 'admin'), validate(contentController.detectSchema), wrap(contentController.detectController));
router.get('/contents/:id', auth, validate(contentController.idParamSchema, 'params'), wrap(contentController.detailController));
router.post('/contents', auth, requireRole('editor', 'admin'), validate(contentController.contentSchema), wrap(contentController.createController));
router.put('/contents/:id', auth, requireRole('editor', 'admin'), validate(contentController.idParamSchema, 'params'), validate(contentController.contentSchema), wrap(contentController.updateController));
router.delete('/contents/:id', auth, requireRole('editor', 'admin'), validate(contentController.idParamSchema, 'params'), wrap(contentController.deleteController));
router.patch('/contents/:id/submit', auth, requireRole('editor', 'admin'), validate(contentController.idParamSchema, 'params'), wrap(contentController.submitController));
router.patch('/contents/:id/pin', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), validate(contentController.pinSchema), wrap(contentController.pinController));

router.get('/sensitive-words', auth, requireRole('admin'), validate(sensitiveController.sensitiveQuerySchema, 'query'), wrap(sensitiveController.listController));
router.post('/sensitive-words', auth, requireRole('admin'), validate(sensitiveController.sensitiveSchema), wrap(sensitiveController.createController));
router.post('/sensitive-words/batch', auth, requireRole('admin'), validate(sensitiveController.batchSchema), wrap(sensitiveController.batchController));
router.put('/sensitive-words/:id', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), validate(sensitiveController.sensitiveSchema), wrap(sensitiveController.updateController));
router.patch('/sensitive-words/:id/toggle', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), validate(sensitiveController.toggleSchema), wrap(sensitiveController.toggleController));
router.delete('/sensitive-words/:id', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), wrap(sensitiveController.deleteController));

router.get('/reviews/pending', auth, requireRole('admin'), validate(reviewController.reviewQuerySchema, 'query'), wrap(reviewController.pendingController));
router.get('/reviews/history', auth, requireRole('admin'), validate(reviewController.reviewQuerySchema, 'query'), wrap(reviewController.historyController));
router.post('/reviews/:contentId/approve', auth, requireRole('admin'), validate(reviewController.reviewBodySchema), wrap(reviewController.approveController));
router.post('/reviews/:contentId/reject', auth, requireRole('admin'), validate(reviewController.reviewBodySchema), wrap(reviewController.rejectController));

router.get('/reports/stats', auth, requireRole('admin'), wrap(reportController.statsController));
router.get('/reports/export/word', auth, requireRole('admin'), wrap(reportController.wordController));
router.get('/reports/export/excel', auth, requireRole('admin'), wrap(reportController.excelController));

router.get('/logs', auth, requireRole('admin'), validate(logController.logQuerySchema, 'query'), wrap(logController.listController));

export default router;
