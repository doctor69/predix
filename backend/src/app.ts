import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import marketsRouter from './routes/markets';
import categoriesRouter from './routes/categories';
import usersRouter from './routes/users';
import evidenceRouter from './routes/evidence';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/markets', marketsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/evidence', evidenceRouter);

app.use(errorHandler);

export default app;
