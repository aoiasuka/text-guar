import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/log.controller.js';

const router = Router();

router.get(
  '/',
  auth,
  requireRole('admin'),
  validate(ctrl.logQuerySchema, 'query'),
  wrap(ctrl.listController),
);

export default router;
