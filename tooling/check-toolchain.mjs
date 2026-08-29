import process from 'node:process';

const expectedNode = 'v22.12.0';
const expectedPnpm = '9.11.0';

if (process.version !== expectedNode) {
  console.error(`Expected Node ${expectedNode}, received ${process.version}.`);
  process.exit(1);
}

const ua = process.env.npm_config_user_agent ?? '';
if (!ua.includes(`pnpm/${expectedPnpm}`)) {
  console.error(`Expected pnpm ${expectedPnpm}. user-agent=${ua || '<missing>'}`);
  process.exit(1);
}

console.log('Toolchain OK.');
