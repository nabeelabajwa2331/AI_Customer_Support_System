
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Run this script directly in an interactive terminal.');
  }

  stdout.write(prompt);
  stdin.setEncoding('utf8');
  stdin.resume();
  stdin.setRawMode(true);

  return new Promise((resolve, reject) => {
    let value = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
    };

    const onData = (key: string) => {
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
        return;
      }

      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(value);
        return;
      }

      if (key === '\u007f' || key === '\b') {
        value = Array.from(value).slice(0, -1).join('');
        return;
      }

      if (key >= ' ' && key !== '\u007f') {
        value += key;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  let name: string;
  let email: string;

  try {
    name = (await rl.question('Admin name: ')).trim();
    email = (await rl.question('Admin email: ')).trim().toLowerCase();
  } finally {
    rl.close();
  }

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid name and email address.');
  }

  const password = await readHidden('Admin password (input hidden): ');

  if (password.length < 8 || password.length > 72) {
    throw new Error('Password must be between 8 and 72 characters.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new Error(
      'That email already exists. No account was changed. Choose another email or handle the existing account separately.',
    );
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  console.log('\nAdmin account created successfully:');
  console.log(user);
}

main()
  .catch((error: unknown) => {
    console.error(
      '\nAdmin creation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
