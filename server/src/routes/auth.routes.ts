import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/auth.controller.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = Router();

router.post('/login', validate(ctrl.loginSchema), wrap(ctrl.loginController));
router.post(
  '/register',
  auth,
  requireRole('admin'),
  validate(ctrl.registerSchema),
  wrap(ctrl.registerController),
);
router.get('/profile', auth, wrap(ctrl.profileController));
router.put('/password', auth, validate(ctrl.passwordSchema), wrap(ctrl.passwordController));

export default router;
