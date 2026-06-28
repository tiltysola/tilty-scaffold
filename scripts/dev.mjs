import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processes = [
  spawn(npmCommand, ['run', 'dev:backend'], { stdio: 'inherit' }),
  spawn(npmCommand, ['run', 'dev:frontend'], { stdio: 'inherit' }),
];

let shuttingDown = false;

for (const childProcess of processes) {
  childProcess.on('error', (error) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.error(error);
    stopProcesses();
    process.exitCode = 1;
  });

  childProcess.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    stopProcesses();
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopProcesses(signal);
}

function stopProcesses(signal = 'SIGTERM') {
  for (const childProcess of processes) {
    if (!childProcess.killed) {
      childProcess.kill(signal);
    }
  }
}
