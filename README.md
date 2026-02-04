# HVAC App Demo

## To run:

### Frontend (/frontend)

1. Fill out .env file from example (can copy)
2. `npm i`
3. `npm run dev`

### Database (local)

1. Make sure postgres is set up and running on your computer
2. Fill out the .env file for the backend (everything can be copied except for the connection string)
   `for example, my connection string is "postgresql://postgres:postgres@localhost:5432/hvac"`

### Backend (/backend)

1. `npm i`
2. `npm run build`
3. `npx prisma migrate dev`
4. `npm run start`

### Frontend Testing (/frontend)

1. Run Frontend & Backend
2. `npm run test:e2e:ui` or `npm run test:e2e`
