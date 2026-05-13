import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import * as authController from '../controllers/auth.controller.js';
import * as contentController from '../controllers/content.controller.js';
import * as sensitiveController from '../controllers/sensitive.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as reportController from '../controllers/report.controller.js';
import * as logController from '../controllers/log.controller.js';

const router = Router();

router.post('/auth/login', validate(authController.loginSchema), authController.loginController);
router.post(
  '/auth/register',
  auth,
  requireRole('admin'),
  validate(authController.registerSchema),
  authController.registerController,
);
router.get('/auth/profile', auth, authController.profileController);
router.put('/auth/password', auth, validate(authController.passwordSchema), authController.passwordController);

router.get('/contents', auth, validate(contentController.pageQuerySchema, 'query'), contentController.listController);
router.post('/contents/detect', auth, requireRole('editor', 'admin'), validate(contentController.detectSchema), contentController.detectController);
router.get('/contents/:id', auth, validate(contentController.idParamSchema, 'params'), contentController.detailController);
router.post('/contents', auth, requireRole('editor', 'admin'), validate(contentController.contentSchema), contentController.createController);
router.put('/contents/:id', auth, requireRole('editor', 'admin'), validate(contentController.idParamSchema, 'params'), validate(contentController.contentSchema), contentController.updateController);
router.delete('/contents/:id', auth, requireRole('editor', 'admin'), validate(contentController.idParamSchema, 'params'), contentController.deleteController);
router.patch('/contents/:id/submit', auth, requireRole('editor', 'admin'), validate(contentController.idParamSchema, 'params'), contentController.submitController);
router.patch('/contents/:id/pin', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), validate(contentController.pinSchema), contentController.pinController);

router.get('/sensitive-words', auth, requireRole('admin'), validate(sensitiveController.sensitiveQuerySchema, 'query'), sensitiveController.listController);
router.post('/sensitive-words', auth, requireRole('admin'), validate(sensitiveController.sensitiveSchema), sensitiveController.createController);
router.post('/sensitive-words/batch', auth, requireRole('admin'), validate(sensitiveController.batchSchema), sensitiveController.batchController);
router.put('/sensitive-words/:id', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), validate(sensitiveController.sensitiveSchema), sensitiveController.updateController);
router.patch('/sensitive-words/:id/toggle', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), validate(sensitiveController.toggleSchema), sensitiveController.toggleController);
router.delete('/sensitive-words/:id', auth, requireRole('admin'), validate(contentController.idParamSchema, 'params'), sensitiveController.deleteController);

router.get('/reviews/pending', auth, requireRole('admin'), validate(reviewController.reviewQuerySchema, 'query'), reviewController.pendingController);
router.get('/reviews/history', auth, requireRole('admin'), validate(reviewController.reviewQuerySchema, 'query'), reviewController.historyController);
router.post('/reviews/:contentId/approve', auth, requireRole('admin'), validate(reviewController.reviewBodySchema), reviewController.approveController);
router.post('/reviews/:contentId/reject', auth, requireRole('admin'), validate(reviewController.reviewBodySchema), reviewController.rejectController);

router.get('/reports/stats', auth, requireRole('admin'), reportController.statsController);
router.get('/reports/export/word', auth, requireRole('admin'), reportController.wordController);
router.get('/reports/export/excel', auth, requireRole('admin'), reportController.excelController);

router.get('/logs', auth, requireRole('admin'), validate(logController.logQuerySchema, 'query'), logController.listController);

export default router;
