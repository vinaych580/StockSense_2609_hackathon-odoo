import 'dotenv/config';

// Point the app's Prisma client at the test database before anything imports src/lib/db.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
