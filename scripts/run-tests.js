const { spawn } = require('child_process');

console.log('Starting server...');

const server = spawn('node', ['server.js']);

server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('Server output:', output);
  
  if (output.includes('Signaling server running')) {
    console.log('Server is ready, starting tests...');
    
    const test = spawn('npm', ['run', 'test:coverage'], { 
      stdio: 'inherit'
    });
    
    test.on('close', (code) => {
      console.log('Tests completed with code:', code);
      server.kill();
      process.exit(code);
    });
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
}); 