import express from 'express';
import cors from 'cors';
import passengerRoutes from './routes/passenger.routes';
import driverRoutes from './routes/driver.routes';
import simulationRoutes from './routes/simulation.routes';

const app = express();

app.use(cors());
app.use(express.json());

// Health check & welcome endpoints
app.get('/', (_req, res) => {
    res.status(200).json({
        service: 'Dhaka Tesla Pool API',
        status: 'online',
        endpoints: {
            health: '/health',
            passengers: '/api/passengers',
            drivers: '/api/drivers',
            simulation: '/api/simulation/banani-rush-hour',
        },
    });
});

app.get('/api', (_req, res) => {
    res.status(200).json({
        service: 'Dhaka Tesla Pool API',
        status: 'online',
        endpoints: {
            passengers: '/api/passengers',
            drivers: '/api/drivers',
            simulation: '/api/simulation/banani-rush-hour',
        },
    });
});

app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'Dhaka Tesla Pool API',
        timestamp: new Date().toISOString(),
    });
});

// Mount domain routes
app.use('/api/passengers', passengerRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/simulation', simulationRoutes);

export default app;