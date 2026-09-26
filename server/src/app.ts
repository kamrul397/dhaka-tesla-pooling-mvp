import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint (Mandated for Docker & deployment in Section 6/7)
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'Dhaka Tesla Pool API',
        timestamp: new Date().toISOString()
    });
});

export default app;