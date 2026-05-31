import { config, missingCredentials } from './config';
import { createServer } from './server';

const app = createServer();

app.listen(config.port, () => {
  /* eslint-disable no-console */
  console.log('────────────────────────────────────────────────────────');
  console.log('  Dashboard Multi-Akun Shopee (Open API v2 / OAuth)');
  console.log('────────────────────────────────────────────────────────');
  console.log(`  URL        : http://localhost:${config.port}`);
  console.log(`  Host API   : ${config.host}`);
  console.log(`  Redirect   : ${config.redirectUrl}`);
  const missing = missingCredentials();
  if (missing.length) {
    console.log('');
    console.log('  PERINGATAN: kredensial belum lengkap ->', missing.join(', '));
    console.log('  Salin .env.example menjadi .env lalu isi nilainya.');
  }
  console.log('────────────────────────────────────────────────────────');
  /* eslint-enable no-console */
});
