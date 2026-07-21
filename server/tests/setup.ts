/* Vitest global setup — provide deterministic env before config loads. */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/automatorr-test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-0123456789';
process.env.ADMIN_USERNAME ??= 'admin';
// bcrypt hash of "test-password" (generated with bcryptjs, cost 10)
process.env.ADMIN_PASSWORD_HASH ??=
  '$2a$10$RuB/ZxeDHWwYsT0BhnRJkeGjefXvEGUfQygNNHbJg3M.lCFQrtg8S';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';
