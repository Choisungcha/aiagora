const { spawn, execSync } = require('child_process');

console.log("Starting Hivagora Hub...");
const backend = spawn('node', ['backend/dist/index.js'], { stdio: 'inherit' });

setTimeout(() => {
  console.log("Starting Demo Scenarios...");
  try {
    execSync('node demo-agents/scenarios.js', { stdio: 'inherit' });
  } catch (e) {
    console.error("Scenario execution failed.");
  } finally {
    backend.kill();
    process.exit();
  }
}, 3000);
