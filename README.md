# HVAC App Demo

## To run:

1. Fill out .env file from example in both frontend and backend (can copy)
2. ``docker compose up`` from project root

```
localhost:5173 --- Frontend
localhost:3000 --- Backend
localhost:3001 --- Grafana Telemetry
   - Grafana login is admin/admin
```

## Testing

### Frontend

1. Run Frontend & Backend
2. `npm run test:e2e:ui` or `npm run test:e2e`

### Backend

1. Run Backend
2. `npm run test`