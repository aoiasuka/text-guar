import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { dataScope, requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/content.controller.js';

const router = Router();

router.get(
  '/',
  auth,
  requirePermission('content:list'),
  dataScope('content'),
  validate(ctrl.pageQuerySchema, 'query'),
  wrap(ctrl.listController),
);
router.post(
  '/detect',
  auth,
  requirePermission('content:detect'),
  validate(ctrl.detectSchema),
  wrap(ctrl.detectController),
);
router.get(
  '/:id',
  auth,
  requirePermission('content:detail'),
  dataScope('content'),
  validate(ctrl.idParamSchema, 'params'),
  wrap(ctrl.detailController),
);
router.post(
  '/',
  auth,
  requirePermission('content:create'),
  validate(ctrl.contentSchema),
  wrap(ctrl.createController),
);
router.put(
  '/:id',
  auth,
  requirePermission('content:update'),
  dataScope('content'),
  validate(ctrl.idParamSchema, 'params'),
  validate(ctrl.contentSchema),
  wrap(ctrl.updateController),
);
router.delete(
  '/:id',
  auth,
  requirePermission('content:delete'),
  dataScope('content'),
  validate(ctrl.idParamSchema, 'params'),
  wrap(ctrl.deleteController),
);
router.patch(
  '/:id/submit',
  auth,
  requirePermission('content:submit'),
  dataScope('content'),
  validate(ctrl.idParamSchema, 'params'),
  wrap(ctrl.submitController),
);
router.patch(
  '/:id/pin',
  auth,
  requirePermission('content:pin'),
  validate(ctrl.idParamSchema, 'params'),
  validate(ctrl.pinSchema),
  wrap(ctrl.pinController),
);

export default router;
