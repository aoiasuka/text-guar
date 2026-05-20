import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', validate(ctrl.loginSchema), wrap(ctrl.loginController));
router.post(
  '/register',
  auth,
  requirePermission('user:register'),
  validate(ctrl.registerSchema),
  wrap(ctrl.registerController),
);
router.get('/profile', auth, wrap(ctrl.profileController));
router.get('/menu', auth, wrap(ctrl.menuController));
router.get('/permissions', auth, wrap(ctrl.permissionsController));
router.put(
  '/password',
  auth,
  requirePermission('user:password'),
  validate(ctrl.passwordSchema),
  wrap(ctrl.passwordController),
);

export default router;
