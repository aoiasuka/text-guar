import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { dataScope, requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/log.controller.js';

const router = Router();

router.get(
  '/',
  auth,
  requirePermission('log:list'),
  dataScope('log'),
  validate(ctrl.logQuerySchema, 'query'),
  wrap(ctrl.listController),
);

export default router;
