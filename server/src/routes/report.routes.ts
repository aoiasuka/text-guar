import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/report.controller.js';

const router = Router();
const admin = [auth, requireRole('admin')] as const;

router.get('/stats', ...admin, wrap(ctrl.statsController));
router.get('/export/word', ...admin, wrap(ctrl.wordController));
router.get('/export/excel', ...admin, wrap(ctrl.excelController));

export default router;
