import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { getUploadDir } from './middleware/upload.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import adminRoutes from './routes/adminRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import consultationRoutes from './routes/consultationRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import recordRoutes from './routes/recordRoutes.js';
import symptomRoutes from './routes/symptomRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(getUploadDir()));

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/auth', authRoutes);
app.use('/doctors', doctorRoutes);
app.use('/leave-requests', leaveRoutes);
app.use('/patients', patientRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/records', recordRoutes);
app.use('/symptoms', symptomRoutes);
app.use('/consultations', consultationRoutes);
app.use('/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
