import dotenv from 'dotenv';
import app from './app.js';
import { initializeDatabase } from './db/schema.js';

dotenv.config();

const port = Number(process.env.PORT || 4000);

await initializeDatabase();

app.listen(port, () => {
  console.log(`Telehealth backend listening on http://localhost:${port}`);
});
