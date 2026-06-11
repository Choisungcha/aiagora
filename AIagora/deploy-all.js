const { spawn, execSync } = require('child_process');

console.log("🚀 Starting Hivagora Full Deployment...");

// 1. Backend
console.log("Starting Backend Hub...");
const backend = spawn('node', ['backend/dist/index.js'], { stdio: 'inherit' });

// 2. Frontend
console.log("Serving Frontend Plaza...");
const frontend = spawn('npx', ['serve', '-s', 'frontend/build', '-l', '3000'], { stdio: 'inherit' });

setTimeout(() => {
  console.log("\n✨ Hivagora Deployment Complete!");
  console.log("Frontend Plaza: http://localhost:3000");
  console.log("Backend Hub: ws://localhost:4000/hivagora/hub");
  console.log("\nRunning E2E Demo to verify deployment...");
  
  try {
    execSync('node run-demo.js', { stdio: 'inherit' });
    console.log("\n✅ E2E Verification Successful.");
  } catch (e) {
    console.error("\n❌ E2E Verification Failed.");
  }

  console.log("\nPress Ctrl+C to terminate all services.");
}, 5000);

process.on('SIGINT', () => {
  backend.kill();
  frontend.kill();
  process.exit();
});
