/**
 * Application entry point. Configures the Express server with JSON parsing,
 * cookie handling, and route mounting. Runs on PORT (default 8080) for
 * compatibility with the AWS Lambda Web Adapter.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { mediaRouter } from './routes/media';
import { healthRouter } from './routes/health';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

app.use(express.json());
app.use(cookieParser());

app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/media', mediaRouter);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
