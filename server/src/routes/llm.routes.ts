import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/llm.controller.js';

const router = Router();

router.get('/status', auth, requirePermission('llm:test'), wrap(ctrl.statusController));
router.post('/test', auth, requirePermission('llm:test'), validate(ctrl.testSchema), wrap(ctrl.testController));

export default router;
