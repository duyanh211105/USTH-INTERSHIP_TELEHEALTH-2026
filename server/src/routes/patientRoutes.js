import { Router } from 'express';
import { getPatient } from '../controllers/patientController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/:id', requireAuth, getPatient);

export default router;
