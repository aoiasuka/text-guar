import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/sensitive.controller.js';
import { idParamSchema } from '../controllers/content.controller.js';

const router = Router();
const admin = [auth, requireRole('admin')] as const;

router.get('/', ...admin, validate(ctrl.sensitiveQuerySchema, 'query'), wrap(ctrl.listController));
router.post('/', ...admin, validate(ctrl.sensitiveSchema), wrap(ctrl.createController));
router.post('/batch', ...admin, validate(ctrl.batchSchema), wrap(ctrl.batchController));
router.post(
  '/batch/toggle',
  ...admin,
  validate(ctrl.batchToggleSchema),
  wrap(ctrl.batchToggleController),
);
router.post(
  '/batch/delete',
  ...admin,
  validate(ctrl.batchIdsSchema),
  wrap(ctrl.batchDeleteController),
);
router.put(
  '/:id',
  ...admin,
  validate(idParamSchema, 'params'),
  validate(ctrl.sensitiveSchema),
  wrap(ctrl.updateController),
);
router.patch(
  '/:id/toggle',
  ...admin,
  validate(idParamSchema, 'params'),
  validate(ctrl.toggleSchema),
  wrap(ctrl.toggleController),
);
router.delete('/:id', ...admin, validate(idParamSchema, 'params'), wrap(ctrl.deleteController));

export default router;
