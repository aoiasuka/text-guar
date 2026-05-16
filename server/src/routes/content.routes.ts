import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/content.controller.js';

const router = Router();

const writer = [auth, requireRole('editor', 'admin')] as const;

router.get('/', auth, validate(ctrl.pageQuerySchema, 'query'), wrap(ctrl.listController));
router.post('/detect', ...writer, validate(ctrl.detectSchema), wrap(ctrl.detectController));
router.get('/:id', auth, validate(ctrl.idParamSchema, 'params'), wrap(ctrl.detailController));
router.post('/', ...writer, validate(ctrl.contentSchema), wrap(ctrl.createController));
router.put(
  '/:id',
  ...writer,
  validate(ctrl.idParamSchema, 'params'),
  validate(ctrl.contentSchema),
  wrap(ctrl.updateController),
);
router.delete(
  '/:id',
  ...writer,
  validate(ctrl.idParamSchema, 'params'),
  wrap(ctrl.deleteController),
);
router.patch(
  '/:id/submit',
  ...writer,
  validate(ctrl.idParamSchema, 'params'),
  wrap(ctrl.submitController),
);
router.patch(
  '/:id/pin',
  auth,
  requireRole('admin'),
  validate(ctrl.idParamSchema, 'params'),
  validate(ctrl.pinSchema),
  wrap(ctrl.pinController),
);

export default router;
