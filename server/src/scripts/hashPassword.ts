import bcrypt from 'bcryptjs';

/** Helper to generate ADMIN_PASSWORD_HASH: `npm run hash-password -- "secret"`. */
const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password --workspace server -- "your-password"');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
