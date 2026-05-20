import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/sensitive.controller.js';
import { idParamSchema } from '../controllers/content.controller.js';

const router = Router();

router.get(
  '/',
  auth,
  requirePermission('sensitive:list'),
  validate(ctrl.sensitiveQuerySchema, 'query'),
  wrap(ctrl.listController),
);
router.post(
  '/',
  auth,
  requirePermission('sensitive:create'),
  validate(ctrl.sensitiveSchema),
  wrap(ctrl.createController),
);
router.post(
  '/batch',
  auth,
  requirePermission('sensitive:create'),
  validate(ctrl.batchSchema),
  wrap(ctrl.batchController),
);
router.post(
  '/batch/toggle',
  auth,
  requirePermission('sensitive:toggle'),
  validate(ctrl.batchToggleSchema),
  wrap(ctrl.batchToggleController),
);
router.post(
  '/batch/delete',
  auth,
  requirePermission('sensitive:delete'),
  validate(ctrl.batchIdsSchema),
  wrap(ctrl.batchDeleteController),
);
router.put(
  '/:id',
  auth,
  requirePermission('sensitive:update'),
  validate(idParamSchema, 'params'),
  validate(ctrl.sensitiveSchema),
  wrap(ctrl.updateController),
);
router.patch(
  '/:id/toggle',
  auth,
  requirePermission('sensitive:toggle'),
  validate(idParamSchema, 'params'),
  validate(ctrl.toggleSchema),
  wrap(ctrl.toggleController),
);
router.delete(
  '/:id',
  auth,
  requirePermission('sensitive:delete'),
  validate(idParamSchema, 'params'),
  wrap(ctrl.deleteController),
);

export default router;
