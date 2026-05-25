import { Router } from 'express';
import { getSymptomsForPatient, postSymptom } from '../controllers/symptomController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { requirePatientParamAccess } from '../middleware/ownership.js';

const router = Router();

router.post('/', requireAuth, asyncHandler(postSymptom));
router.get('/patient/:patientId', requireAuth, requirePatientParamAccess('patientId'), getSymptomsForPatient);

export default router;
