import { Router } from 'express';
import { auth } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { asyncHandler as wrap } from '../utils/async.js';
import * as ctrl from '../controllers/report.controller.js';

const router = Router();

router.get('/stats', auth, requirePermission('report:stats'), wrap(ctrl.statsController));
router.get('/export/word', auth, requirePermission('report:export'), wrap(ctrl.wordController));
router.get('/export/excel', auth, requirePermission('report:export'), wrap(ctrl.excelController));

export default router;
